/**
 * AI Assistant API: conversations as JSON, and the assistant's answer as an SSE stream.
 * SSE event names mirror apps/api/src/lib/ai/constants.ts (SSE_EVENT).
 */
import type { ChatConversation, ChatConversationDetail } from "@moby/types";
import { redirectingFetch, requestJson, toApiError } from "./http";

const BASE = "/api/ai-chat";

export type LLMPublicConfig = { configured: boolean; provider: string; model: string };

export const fetchChatConfig = () => requestJson<LLMPublicConfig>(`${BASE}/config`);

export const fetchConversations = () => requestJson<ChatConversation[]>(`${BASE}/conversations`);

export const fetchConversation = (id: string) =>
  requestJson<ChatConversationDetail>(`${BASE}/conversations/${id}`);

/** A new conversation, bound to `runId` or org-wide when null. */
export const createConversation = (runId: string | null) =>
  requestJson<ChatConversation>(`${BASE}/conversations`, {
    method: "POST",
    body: { run_id: runId ?? undefined },
  });

export const updateConversation = (id: string, patch: { title?: string; archived?: boolean }) =>
  requestJson<ChatConversation>(`${BASE}/conversations/${id}`, { method: "PATCH", body: patch });

export const deleteConversation = (id: string) =>
  requestJson<void>(`${BASE}/conversations/${id}`, { method: "DELETE" });

export type ChatStreamEvent = { event: string; data: unknown };

/** Send a message and yield the server's SSE events as they arrive. */
export async function* streamChatMessage(
  conversationId: string,
  message: string,
  signal: AbortSignal
): AsyncGenerator<ChatStreamEvent> {
  const res = await redirectingFetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!res.ok) throw toApiError(await res.json().catch(() => null), res.status);
  yield* readSSE(res);
}

async function* readSSE(response: Response): AsyncGenerator<ChatStreamEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        let event = "message";
        let data = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data = line.slice(6).trim();
        }
        if (!data) continue;
        try {
          yield { event, data: JSON.parse(data) as unknown };
        } catch {
          /* skip malformed */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
