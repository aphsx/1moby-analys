/**
 * AI Chat routes.
 *
 * Conversations persist to PostgreSQL (ai_conversations / ai_messages) and may
 * be bound to a prediction run (ai_conversations.run_id). A bound conversation
 * hard-scopes every Text-to-SQL query to that run; a global conversation can
 * query across all org runs (runs/sources are shared org-wide). The binding is
 * fixed at creation — a chat about run A stays about run A even when the active
 * run changes.
 *
 * Sending a message streams a token-by-token SSE response from the orchestrator.
 *
 * Routes (all require auth; conversations themselves stay private per user):
 *   GET    /ai-chat/config
 *   GET    /ai-chat/conversations
 *   POST   /ai-chat/conversations              { title?, run_id? }
 *   GET    /ai-chat/conversations/:id
 *   PATCH  /ai-chat/conversations/:id          { title?, archived? }
 *   DELETE /ai-chat/conversations/:id
 *   POST   /ai-chat/conversations/:id/messages → SSE stream
 */

import { and, desc, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "../db/client";
import { aiConversations, aiMessages, mlPredictionRuns } from "../db/schema";
import { denyNotFound } from "../lib/access-control";
import { orchestrate, sseError } from "../lib/ai";
import { DEFAULT_CONVERSATION_TITLE, ERROR_CODE } from "../lib/ai/constants";
import { getLLMConfig, isLLMConfigured } from "../lib/ai/llm-config";
import { requireUser } from "../lib/auth-middleware";
import { UUID_RE } from "../lib/constants";

const MAX_MESSAGE_CHARS = 12_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getConversation(id: string, userId: string) {
  const [conv] = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
    .limit(1);
  return conv ?? null;
}

/** Verify a prediction run exists before binding a chat to it (org-shared). */
async function runExists(runId: string): Promise<boolean> {
  if (!UUID_RE.test(runId)) {
    return false;
  }
  const [row] = await db
    .select({ id: mlPredictionRuns.id })
    .from(mlPredictionRuns)
    .where(eq(mlPredictionRuns.id, runId))
    .limit(1);
  return Boolean(row);
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export const aiChatRoutes = new Elysia({ prefix: "/ai-chat" })
  .use(requireUser)

  // ── Public LLM config (so the UI shows the real provider/model) ──────────────
  .get("/config", () => {
    const c = getLLMConfig();
    return {
      configured: isLLMConfigured(),
      model: c.model,
      provider: c.provider,
    };
  })

  // ── List conversations (+ bound run name) ────────────────────────────────────
  .get("/conversations", async ({ userId }) => {
    const convs = await db
      .select({
        archived: aiConversations.archived,
        createdAt: aiConversations.createdAt,
        id: aiConversations.id,
        runId: aiConversations.runId,
        runName: mlPredictionRuns.name,
        title: aiConversations.title,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .leftJoin(
        mlPredictionRuns,
        eq(aiConversations.runId, mlPredictionRuns.id)
      )
      .where(eq(aiConversations.userId, userId!))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(100);
    return convs;
  })

  // ── Create conversation (optionally bound to a run) ──────────────────────────
  .post(
    "/conversations",
    async ({ body, userId, set }) => {
      let runId: string | null = null;
      if (body.run_id) {
        if (!(await runExists(body.run_id))) {
          set.status = 404;
          return { code: "run_not_found", message: "Prediction run not found" };
        }
        runId = body.run_id;
      }
      const [conv] = await db
        .insert(aiConversations)
        .values({
          runId,
          title: body.title?.trim() || DEFAULT_CONVERSATION_TITLE,
          userId: userId!,
        })
        .returning();
      return conv;
    },
    {
      body: t.Object({
        run_id: t.Optional(t.String()),
        title: t.Optional(t.String({ maxLength: 100 })),
      }),
    }
  )

  // ── Get conversation + messages ──────────────────────────────────────────────
  .get(
    "/conversations/:id",
    async ({ params, userId, set }) => {
      if (!UUID_RE.test(params.id)) {
        return denyNotFound(set, "Not found");
      }
      const conv = await getConversation(params.id, userId!);
      if (!conv) {
        return denyNotFound(set, "Conversation not found");
      }

      const msgs = await db
        .select({
          content: aiMessages.content,
          createdAt: aiMessages.createdAt,
          evidenceJson: aiMessages.evidenceJson,
          id: aiMessages.id,
          model: aiMessages.model,
          role: aiMessages.role,
        })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .orderBy(aiMessages.id)
        .limit(200);

      return { ...conv, messages: msgs };
    },
    { params: t.Object({ id: t.String() }) }
  )

  // ── Rename / archive conversation ────────────────────────────────────────────
  .patch(
    "/conversations/:id",
    async ({ params, body, userId, set }) => {
      if (!UUID_RE.test(params.id)) {
        return denyNotFound(set, "Not found");
      }
      const conv = await getConversation(params.id, userId!);
      if (!conv) {
        return denyNotFound(set, "Conversation not found");
      }

      const updates: { title?: string; archived?: boolean; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) {
        updates.title = body.title.trim().slice(0, 100) || conv.title;
      }
      if (body.archived !== undefined) {
        updates.archived = body.archived;
      }

      const [updated] = await db
        .update(aiConversations)
        .set(updates)
        .where(eq(aiConversations.id, params.id))
        .returning();
      return updated;
    },
    {
      body: t.Object({
        archived: t.Optional(t.Boolean()),
        title: t.Optional(t.String({ maxLength: 100 })),
      }),
      params: t.Object({ id: t.String() }),
    }
  )

  // ── Delete conversation ──────────────────────────────────────────────────────
  .delete(
    "/conversations/:id",
    async ({ params, userId, set }) => {
      if (!UUID_RE.test(params.id)) {
        return denyNotFound(set, "Not found");
      }
      const conv = await getConversation(params.id, userId!);
      if (!conv) {
        return denyNotFound(set, "Conversation not found");
      }

      await db.delete(aiConversations).where(eq(aiConversations.id, params.id));
      set.status = 204;
      return null;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // ── Send message → SSE stream ────────────────────────────────────────────────
  .post(
    "/conversations/:id/messages",
    async ({ params, body, userId, set }) => {
      if (!UUID_RE.test(params.id)) {
        return denyNotFound(set, "Conversation not found");
      }
      const conv = await getConversation(params.id, userId!);
      if (!conv) {
        return denyNotFound(set, "Conversation not found");
      }

      const userMessage = body.message.trim();
      if (!userMessage) {
        set.status = 400;
        return { message: "Message cannot be empty" };
      }

      // First message in a default-titled conversation → generate an auto-title.
      const [firstMsg] = await db
        .select({ id: aiMessages.id })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .limit(1);
      const generateTitle =
        !firstMsg && conv.title === DEFAULT_CONVERSATION_TITLE;

      const gen = orchestrate({
        boundRunId: conv.runId ?? null,
        conversationId: params.id,
        generateTitle,
        userId: userId!,
        userMessage,
      });

      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();
          try {
            for await (const chunk of gen) {
              controller.enqueue(enc.encode(chunk));
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream error";
            controller.enqueue(
              enc.encode(sseError(msg, ERROR_CODE.STREAM_ERROR))
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      body: t.Object({
        message: t.String({ maxLength: MAX_MESSAGE_CHARS, minLength: 1 }),
      }),
      params: t.Object({ id: t.String() }),
    }
  );
