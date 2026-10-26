/**
 * Chat store — conversation persistence + SSE streaming.
 *
 * Design notes:
 *  - Conversation-based (multiple threads, sidebar list), each optionally bound
 *    to a prediction run. The binding is fixed at creation; switching the active
 *    run never rewrites an existing thread.
 *  - Streaming is O(1) per token: the in-flight assistant message lives in a
 *    dedicated `streaming` slot, so committed `messages` are not re-mapped on
 *    every token. On completion the streamed message is committed once.
 *  - HTTP and SSE live in lib/ai-chat-api.ts; this store only holds state.
 *  - Abort via AbortController kept outside state to avoid re-renders.
 */

import type { ChatConversation, ChatEvidence } from "@moby/types";
import { create } from "zustand";
import {
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
  fetchChatConfig,
  fetchConversation,
  fetchConversations,
  streamChatMessage,
  updateConversation,
  type LLMPublicConfig,
} from "@/lib/ai-chat-api";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatMsg = {
  id: string; // "db:<n>" persisted, "opt:<ts>" optimistic
  dbId?: number;
  role: "user" | "assistant";
  content: string;
  ts: number;
  evidence?: ChatEvidence;
  error?: boolean;
};

export type { ChatEvidence };
export type Conversation = ChatConversation;

export type ThinkingStep = { step: string; message: string };
export type StreamingMsg = { id: string; content: string; evidence?: ChatEvidence };

// SSE payloads
type SSEThinking = { step: string; message: string };
type SSEToken = { text: string };
type SSETitle = { title: string };
type SSEDone = { message_id: number };
type SSEError = { message: string; code: string };

// ── State ──────────────────────────────────────────────────────────────────────

type ChatState = {
  config: LLMPublicConfig | null;
  conversations: Conversation[];
  showArchived: boolean;
  activeId: string | null;
  messages: ChatMsg[];
  streaming: StreamingMsg | null;
  sending: boolean;
  thinkingStep: ThinkingStep | null;
  /** Run id the NEXT new conversation will be bound to (null = global). */
  pendingRunId: string | null;

  loadConfig: () => Promise<void>;
  loadConversations: () => Promise<void>;
  createConversation: (runId?: string | null) => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  archiveConversation: (id: string, archived: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setPendingRun: (runId: string | null) => void;
  setShowArchived: (v: boolean) => void;

  send: (text: string) => Promise<void>;
  cancel: () => void;

  // Floating widget
  unread: number;
  widgetOpen: boolean;
  setWidgetOpen: (open: boolean) => void;
  reset: () => void;
};

let controller: AbortController | null = null;

// ── Store ──────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((set, get) => ({
  config: null,
  conversations: [],
  showArchived: false,
  activeId: null,
  messages: [],
  streaming: null,
  sending: false,
  thinkingStep: null,
  pendingRunId: null,
  unread: 0,
  widgetOpen: false,

  loadConfig: async () => {
    try {
      set({ config: await fetchChatConfig() });
    } catch {
      set({ config: { configured: false, provider: "", model: "" } });
    }
  },

  loadConversations: async () => {
    try {
      set({ conversations: await fetchConversations() });
    } catch {
      /* empty sidebar on failure */
    }
  },

  createConversation: async (runId?: string | null) => {
    const bind = runId !== undefined ? runId : get().pendingRunId;
    const conv = await apiCreateConversation(bind ?? null);
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeId: conv.id,
      messages: [],
      streaming: null,
      thinkingStep: null,
    }));
    return conv.id;
  },

  selectConversation: async (id: string) => {
    if (get().activeId === id) return;
    controller?.abort();
    controller = null;
    set({ activeId: id, messages: [], streaming: null, sending: false, thinkingStep: null });
    try {
      const conv = await fetchConversation(id);
      const msgs: ChatMsg[] = conv.messages.map((m) => ({
        id: `db:${m.id}`,
        dbId: m.id,
        role: m.role,
        content: m.content,
        ts: new Date(m.created_at).getTime(),
        evidence: m.evidence ?? undefined,
      }));
      // Ignore late responses if the user switched away mid-load.
      if (get().activeId === id) set({ messages: msgs });
    } catch {
      if (get().activeId === id) set({ messages: [] });
    }
  },

  renameConversation: async (id: string, title: string) => {
    await updateConversation(id, { title });
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  archiveConversation: async (id: string, archived: boolean) => {
    await updateConversation(id, { archived });
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, archived } : c)),
    }));
  },

  deleteConversation: async (id: string) => {
    await apiDeleteConversation(id);
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const switching = s.activeId === id;
      const nextActive = switching ? null : s.activeId;
      return {
        conversations,
        activeId: nextActive,
        messages: switching ? [] : s.messages,
        streaming: switching ? null : s.streaming,
      };
    });
  },

  setPendingRun: (runId: string | null) => set({ pendingRunId: runId }),
  setShowArchived: (v: boolean) => set({ showArchived: v }),

  send: async (text: string) => {
    const content = text.trim();
    if (!content || get().sending) return;

    let activeId = get().activeId;
    if (!activeId) activeId = await get().createConversation();

    controller?.abort();
    controller = new AbortController();

    const userMsg: ChatMsg = { id: `opt:u-${Date.now()}`, role: "user", content, ts: Date.now() };
    const streamId = `opt:a-${Date.now()}`;

    set((s) => ({
      messages: [...s.messages, userMsg],
      streaming: { id: streamId, content: "" },
      sending: true,
      thinkingStep: null,
    }));

    // Token buffer kept local so per-token updates stay O(1).
    let acc = "";
    let evidence: ChatEvidence | undefined;

    const commitAssistant = (final: string, opts: { error?: boolean } = {}) => {
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: streamId,
            role: "assistant",
            content: final,
            ts: Date.now(),
            evidence,
            error: opts.error,
          },
        ],
        streaming: null,
        thinkingStep: null,
        unread: s.widgetOpen ? s.unread : s.unread + 1,
      }));
    };

    try {
      for await (const { event, data } of streamChatMessage(activeId, content, controller.signal)) {
        switch (event) {
          case "thinking":
            set({ thinkingStep: data as SSEThinking });
            break;
          case "token":
            acc += (data as SSEToken).text;
            set((s) => ({
              thinkingStep: null,
              streaming: s.streaming ? { ...s.streaming, content: acc } : s.streaming,
            }));
            break;
          case "title": {
            const title = (data as SSETitle).title;
            set((s) => ({
              conversations: s.conversations.map((c) =>
                c.id === activeId ? { ...c, title } : c
              ),
            }));
            break;
          }
          case "evidence":
            evidence = data as ChatEvidence;
            break;
          case "done":
            commitAssistant(acc);
            void get().loadConversations();
            break;
          case "error":
            commitAssistant(`เกิดข้อผิดพลาด: ${(data as SSEError).message}`, { error: true });
            break;
        }
      }
      // Stream ended without an explicit done/error (e.g. truncated): commit what we have.
      if (get().streaming?.id === streamId) commitAssistant(acc || "การเชื่อมต่อถูกตัด");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Drop the optimistic user message + streaming bubble.
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== userMsg.id),
          streaming: null,
          thinkingStep: null,
        }));
        return;
      }
      const message = err instanceof Error ? err.message : "chat_failed";
      commitAssistant(`เชื่อมต่อ AI ไม่สำเร็จ: ${message}`, { error: true });
    } finally {
      set({ sending: false });
      controller = null;
    }
  },

  cancel: () => controller?.abort(),


  setWidgetOpen: (open: boolean) => set((s) => ({ widgetOpen: open, unread: open ? 0 : s.unread })),

  reset: () => {
    controller?.abort();
    controller = null;
    set({
      activeId: null,
      messages: [],
      streaming: null,
      sending: false,
      thinkingStep: null,
      unread: 0,
    });
  },
}));

// ── Formatting helpers ─────────────────────────────────────────────────────────

