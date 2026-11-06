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

import type { ChatConversation, ChatConversationDetail, ChatEvidence, ChatMessageRecord } from "@moby/types";
import Elysia, { t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { aiConversations, aiMessages, mlPredictionRuns } from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, notFound } from "../lib/http/errors";
import { orchestrate, sseError } from "../lib/ai";
import { getLLMConfig, isLLMConfigured } from "../lib/ai/llm-config";
import { DEFAULT_CONVERSATION_TITLE, ERROR_CODE } from "../lib/ai/constants";

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
  const [row] = await db
    .select({ id: mlPredictionRuns.id })
    .from(mlPredictionRuns)
    .where(eq(mlPredictionRuns.id, runId))
    .limit(1);
  return Boolean(row);
}

type ConversationRow = typeof aiConversations.$inferSelect;

function mapConversation(row: ConversationRow, runName: string | null = null): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    archived: row.archived,
    run_id: row.runId,
    run_name: runName,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export const aiChatRoutes = new Elysia({ prefix: "/ai-chat" })
  .use(requireUser)

  // ── Public LLM config (so the UI shows the real provider/model) ──────────────
  .get("/config", () => {
    const c = getLLMConfig();
    return { configured: isLLMConfigured(), provider: c.provider, model: c.model };
  })

  // ── List conversations (+ bound run name) ────────────────────────────────────
  .get("/conversations", async ({ userId }): Promise<ChatConversation[]> => {
    const rows = await db
      .select({ conversation: aiConversations, runName: mlPredictionRuns.name })
      .from(aiConversations)
      .leftJoin(mlPredictionRuns, eq(aiConversations.runId, mlPredictionRuns.id))
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(100);
    return rows.map((r) => mapConversation(r.conversation, r.runName));
  })

  // ── Create conversation (optionally bound to a run) ──────────────────────────
  .post(
    "/conversations",
    async ({ body, userId }) => {
      let runId: string | null = null;
      if (body.run_id) {
        if (!(await runExists(body.run_id))) {
          throw notFound("Prediction run not found");
        }
        runId = body.run_id;
      }
      const [conv] = await db
        .insert(aiConversations)
        .values({
          userId: userId,
          runId,
          title: body.title?.trim() || DEFAULT_CONVERSATION_TITLE,
        })
        .returning();
      return mapConversation(conv);
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 100 })),
        run_id: t.Optional(t.String({ format: "uuid" })),
      }),
    }
  )

  // ── Get conversation + messages ──────────────────────────────────────────────
  .get(
    "/conversations/:id",
    async ({ params, userId }) => {
      const conv = await getConversation(params.id, userId);
      if (!conv) throw notFound("Conversation not found");

      const msgs = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .orderBy(aiMessages.id)
        .limit(200);

      const detail: ChatConversationDetail = {
        ...mapConversation(conv),
        messages: msgs.map((m) => ({
          id: m.id,
          role: m.role as ChatMessageRecord["role"],
          content: m.content,
          evidence: (m.evidenceJson as ChatEvidence | null) ?? null,
          model: m.model,
          created_at: m.createdAt.toISOString(),
        })),
      };
      return detail;
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )

  // ── Rename / archive conversation ────────────────────────────────────────────
  .patch(
    "/conversations/:id",
    async ({ params, body, userId }) => {
      const conv = await getConversation(params.id, userId);
      if (!conv) throw notFound("Conversation not found");

      const updates: { title?: string; archived?: boolean; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) updates.title = body.title.trim().slice(0, 100) || conv.title;
      if (body.archived !== undefined) updates.archived = body.archived;

      const [updated] = await db
        .update(aiConversations)
        .set(updates)
        .where(eq(aiConversations.id, params.id))
        .returning();
      return mapConversation(updated);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 100 })),
        archived: t.Optional(t.Boolean()),
      }),
    }
  )

  // ── Delete conversation ──────────────────────────────────────────────────────
  .delete(
    "/conversations/:id",
    async ({ params, userId, set }) => {
      const conv = await getConversation(params.id, userId);
      if (!conv) throw notFound("Conversation not found");

      await db.delete(aiConversations).where(eq(aiConversations.id, params.id));
      set.status = 204;
      return null;
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )

  // ── Send message → SSE stream ────────────────────────────────────────────────
  .post(
    "/conversations/:id/messages",
    async ({ params, body, userId }) => {
      const conv = await getConversation(params.id, userId);
      if (!conv) throw notFound("Conversation not found");

      const userMessage = body.message.trim();
      if (!userMessage) {
        throw badRequest("Message cannot be empty");
      }

      // First message in a default-titled conversation → generate an auto-title.
      const [firstMsg] = await db
        .select({ id: aiMessages.id })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .limit(1);
      const generateTitle = !firstMsg && conv.title === DEFAULT_CONVERSATION_TITLE;

      const gen = orchestrate({
        conversationId: params.id,
        userId: userId,
        userMessage,
        boundRunId: conv.runId ?? null,
        generateTitle,
      });

      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();
          try {
            for await (const chunk of gen) controller.enqueue(enc.encode(chunk));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream error";
            controller.enqueue(enc.encode(sseError(msg, ERROR_CODE.STREAM_ERROR)));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: MAX_MESSAGE_CHARS }),
      }),
    }
  );
