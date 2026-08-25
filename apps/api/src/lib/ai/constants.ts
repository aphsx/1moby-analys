/**
 * AI module constants — single source of truth for the chat protocol.
 *
 * Magic strings (SSE event names, step ids, status copy, error codes) are
 * centralized here so the orchestrator, sql-agent, and route never drift, and
 * so the frontend contract is documented in one place.
 *
 * The SSE event names are mirrored verbatim by the web chat store
 * (apps/web/src/stores/chat-store.ts). Keep them in sync.
 */

// ── SSE event names (mirrored by the web store) ──────────────────────────────
export const SSE_EVENT = {
  DONE: "done",
  ERROR: "error",
  EVIDENCE: "evidence",
  THINKING: "thinking",
  TITLE: "title",
  TOKEN: "token",
} as const;
export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT];

// ── Planner step ids (stable; UI may key labels/icons off these) ─────────────
export const STEP = {
  ANSWER: "answer",
  PLAN: "plan",
  RETRY: "retry",
  SQL: "sql",
} as const;
export type StepId = (typeof STEP)[keyof typeof STEP];

// ── Stable error codes ───────────────────────────────────────────────────────
export const ERROR_CODE = {
  AI_SAFETY_BLOCKED: "ai_safety_blocked",
  LLM_NOT_CONFIGURED: "llm_not_configured",
  LLM_STREAM_FAILED: "llm_stream_failed",
  ORCHESTRATOR_ERROR: "orchestrator_error",
  STREAM_ERROR: "stream_error",
} as const;

// ── Thai status copy shown as inline "thinking" labels ───────────────────────
export const STATUS_COPY = {
  COMPOSING: "กำลังเรียบเรียงคำตอบ…",
  COMPOSING_FROM_RESULT: "กำลังเรียบเรียงคำตอบจากผลที่ได้…",
  PLANNING: "กำลังวิเคราะห์คำถาม…",
  QUERYING_DB: "กำลังดึงข้อมูลจากฐานข้อมูล…",
  QUERYING_TABLE: (table: string) => `กำลังดึงข้อมูลจาก ${table}…`,
  RETRYING_SQL: "ปรับ query แล้วลองใหม่อีกครั้ง…",
  SUMMARIZING_ROWS: (rows: number) => `กำลังสรุปจากข้อมูล ${rows} แถว…`,
} as const;

// ── Terminal / fallback messages ─────────────────────────────────────────────
export const MESSAGE = {
  LLM_NOT_CONFIGURED:
    "กรุณาตั้งค่า LLM_API_KEY (หรือ OLLAMA_API_KEY) ใน .env ก่อนใช้งาน",
  NO_EVIDENCE: "ไม่มี evidence จากฐานข้อมูล",
  NO_ROWS: "query สำเร็จแต่ไม่พบข้อมูลที่ตรงกัน",
  SAFETY_BLOCKED: "คำถามถูกบล็อกโดย AI safety policy",
} as const;

// ── Limits ───────────────────────────────────────────────────────────────────
/** Max characters of evidence JSON fed back into the answer prompt. */
export const MAX_EVIDENCE_CHARS = 16_000;
/** Conversation turns of history loaded for context. */
export const HISTORY_TURNS = 10;
/** History turns shown to the planner (kept short — it only needs intent). */
export const PLANNER_HISTORY_TURNS = 6;
/** Total Text-to-SQL attempts (1 initial + retries) before falling back. */
export const MAX_SQL_ATTEMPTS = 3;
/** Default conversation title before the first message names it. */
export const DEFAULT_CONVERSATION_TITLE = "New chat";
