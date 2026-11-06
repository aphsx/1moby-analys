/** AI Assistant chat contract (apps/api/src/routes/ai-chat.ts ↔ apps/web/src/stores/chat-store.ts). */

/** What an assistant answer was based on: the SQL it ran and the rows it saw. */
export interface ChatEvidence {
  mode: "text_to_sql" | "direct";
  sql: string | null;
  row_count: number;
  rows: unknown[];
  columns: string[];
  warnings: string[];
  sources: string[];
}

export interface ChatConversation {
  id: string;
  title: string;
  archived: boolean;
  /** The Prediction Run the chat is bound to, or null for an org-wide chat. */
  run_id: string | null;
  run_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: number;
  role: "user" | "assistant";
  content: string;
  evidence: ChatEvidence | null;
  model: string | null;
  created_at: string;
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessageRecord[];
}
