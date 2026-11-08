"use client";

import { type PredictionRun } from "@moby/types";
import {
  useState, useRef, useEffect, useCallback, useMemo,
  type ChangeEvent, type KeyboardEvent,
} from "react";
import {
  Bot, Send, Plus, Trash2, Edit3, X, Menu, ChevronDown, ChevronRight,
  Database, Loader2, AlertCircle, MessageSquare, User, Search,
  Archive, ArchiveRestore, Target,
} from "lucide-react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { TypingDots } from "@/components/chat/typing-dots";
import { Select } from "@/components/select";
import { BUTTON } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { useChatStore, type ChatEvidence, type Conversation } from "@/stores/chat-store";
import { useActiveRun } from "@/stores/run-store";

const VIEWPORT = "h-full";

// ── Run badge ────────────────────────────────────────────────────────────────
function RunBadge({ name }: { name: string }) {
  return (
    <span
      title={`ผูกกับ run: ${name}`}
      className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full bg-accent-soft px-1.5 py-0.5 text-micro font-medium text-accent-ink"
    >
      <Target size={9} className="shrink-0 text-accent" />
      <span className="truncate">{name}</span>
    </span>
  );
}

// ── Sidebar conversation item ──────────────────────────────────────────────────
function ConversationItem({
  conv, active, onSelect, onRename, onArchive, onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== conv.title) onRename(t);
    setEditing(false);
  };

  return (
    <div
      className={[
        "group flex min-w-0 cursor-pointer flex-col gap-1 rounded-control px-3 py-2 transition-colors",
        active
          ? "bg-accent-soft text-accent-ink"
          : "text-text hover:bg-raised",
      ].join(" ")}
      onClick={editing ? undefined : onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MessageSquare size={13} strokeWidth={1.5} className={active ? "shrink-0 text-accent" : "shrink-0 text-faint"} />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={commitRename}
            className="min-w-0 flex-1 bg-transparent text-small outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-small">{conv.title}</span>
        )}
        {!editing && (
          <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(conv.title); }}
              className="rounded p-0.5 hover:bg-raised" title="เปลี่ยนชื่อ"
            >
              <Edit3 size={11} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className="rounded p-0.5 hover:bg-raised"
              title={conv.archived ? "เลิกเก็บ" : "เก็บ"}
            >
              {conv.archived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-0.5 text-negative hover:bg-[var(--pill-negative-bg)]" title="ลบ"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {conv.run_id && conv.run_name && (
        <div className="pl-[21px]">
          <RunBadge name={conv.run_name} />
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({
  runs,
  mobileOpen = false,
  onClose,
}: {
  runs: PredictionRun[];
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const {
    conversations, activeId, showArchived, pendingRunId,
    loadConversations, createConversation, selectConversation,
    renameConversation, archiveConversation, deleteConversation,
    setPendingRun, setShowArchived,
  } = useChatStore();
  const [query, setQuery] = useState("");

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => c.archived === showArchived)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.run_name ?? "").toLowerCase().includes(q));
  }, [conversations, showArchived, query]);

  return (
    <aside className={`absolute inset-y-0 left-0 z-40 flex h-full w-[min(86vw,280px)] shrink-0 flex-col border-r border-border bg-ground transition-transform duration-200 md:static md:z-auto md:w-[232px] md:translate-x-0 ${
      mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
    }`}>
      <div className="space-y-2 p-3">
        {/* Scope picker for the next new chat */}
        <Select
          value={pendingRunId ?? ""}
          onChange={(next) => setPendingRun(next || null)}
          size="sm"
          title="ขอบเขตข้อมูลของแชทใหม่"
          aria-label="ขอบเขตข้อมูลของแชทใหม่"
          placeholder="ทุกรอบทำนาย"
          options={[
            { value: "", label: "ทุกรอบทำนาย" },
            ...runs.map((r) => ({
              value: r.id,
              label: `${r.name} · ${r.cutoff_date}`,
            })),
          ]}
        />

        <button
          type="button"
          onClick={() => {
            createConversation();
            onClose?.();
          }}
          className={`w-full ${BUTTON.primary}`}
        >
          <Plus size={14} strokeWidth={1.5} /> แชทใหม่
        </button>

        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาแชท…"
            className="h-8 w-full rounded-control border border-control bg-surface pl-7 pr-2 text-micro text-text outline-none placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-micro text-faint">
            {showArchived ? "ไม่มีแชทที่ archive" : "ยังไม่มีการสนทนา"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {visible.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                active={conv.id === activeId}
                onSelect={() => {
                  selectConversation(conv.id);
                  onClose?.();
                }}
                onRename={(title) => renameConversation(conv.id, title)}
                onArchive={() => archiveConversation(conv.id, !conv.archived)}
                onDelete={() => deleteConversation(conv.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="flex items-center gap-1.5 text-micro text-muted hover:text-accent"
        >
          {showArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
          {showArchived ? "แชทที่ใช้อยู่" : "แชทที่เก็บไว้"}
        </button>
        <span className="text-micro text-faint">Text-to-SQL + Gen AI</span>
      </div>
    </aside>
  );
}

// ── Evidence panel ─────────────────────────────────────────────────────────────
function EvidencePanel({ evidence }: { evidence: ChatEvidence }) {
  const [open, setOpen] = useState(false);
  const hasData = evidence.sql || evidence.row_count > 0 || evidence.warnings.length > 0;
  if (!hasData) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-control border border-border bg-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-micro text-muted transition-colors hover:bg-surface"
      >
        <Database size={11} strokeWidth={1.5} className="shrink-0 text-accent" />
        <span className="flex-1 text-left font-medium text-text">
          {evidence.mode === "text_to_sql"
            ? `SQL · ${evidence.row_count} แถว`
            : "ตอบโดยตรง"}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border bg-surface p-3">
          {evidence.sql && (
            <div>
              <p className="mb-1 text-micro text-muted">SQL</p>
              <pre className="overflow-x-auto rounded-control bg-raised p-3 text-micro leading-relaxed text-text">
                <code>{evidence.sql}</code>
              </pre>
            </div>
          )}
          {evidence.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-control border border-border bg-[var(--pill-warning-bg)] px-3 py-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-micro text-warning">{evidence.warnings.join(" · ")}</p>
            </div>
          )}
          {evidence.row_count > 0 && evidence.columns.length > 0 && (
            <div>
              <p className="mb-1 text-micro text-muted">
                ผลลัพธ์ · {evidence.row_count} แถว
              </p>
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="data-table min-w-full text-micro">
                  <thead>
                    <tr>
                      {evidence.columns.map((col) => (
                        <th key={col} className="!h-9 !px-2 text-left">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(evidence.rows as Record<string, unknown>[]).slice(0, 20).map((row, ri) => (
                      <tr key={ri}>
                        {evidence.columns.map((col) => (
                          <td key={col} className="!h-9 !px-2 text-muted">
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evidence.row_count > 20 && (
                  <p className="border-t border-rule px-3 py-1.5 text-micro text-faint">
                    + {evidence.row_count - 20} แถวถัดไป
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Thinking + bubbles ─────────────────────────────────────────────────────────
function AssistantAvatar() {
  return (
    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-soft">
      <Bot size={14} strokeWidth={1.5} className="text-accent" />
    </div>
  );
}

function ThinkingBubble({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-soft">
        <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-accent" />
      </div>
      <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
        <span className="text-micro text-muted">{message}</span>
        <TypingDots />
      </div>
    </div>
  );
}

function EmptyState({ onPrompt, runName }: { onPrompt: (p: string) => void; runName: string | null }) {
  const prompts = runName
    ? [
        "สรุปภาพรวม churn ของ run นี้",
        "ลูกค้ากลุ่มเสี่ยงสูงที่มีมูลค่าสูงมีใครบ้าง",
        "ลูกค้าคนไหนเครดิตใกล้หมดใน 30 วัน",
        "ลูกค้า priority สูงสุด 10 อันดับ",
        "account ไหน revenue_at_risk สูงสุด",
        "เทรนด์การใช้งาน SMS เดือนล่าสุดเป็นยังไง",
      ]
    : [
        "สรุปภาพรวม churn ของ run ล่าสุด",
        "ลูกค้ากลุ่มเสี่ยงสูงที่มีมูลค่าสูงมีใครบ้าง",
        "ลูกค้าคนไหนเครดิตใกล้หมดใน 30 วัน",
        "เทรนด์การใช้งาน SMS เดือนล่าสุดเป็นยังไง",
        "เปรียบเทียบจำนวนลูกค้าแต่ละ run",
        "ลูกค้า priority สูงสุด 10 อันดับ",
      ];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10">
      <div className="text-center">
        <h2 className="text-section font-semibold text-text">ผู้ช่วย AI</h2>
        <p className="mt-1 max-w-[48ch] text-small text-muted">
          {runName
            ? `ถามข้อมูลของรอบ “${runName}” ได้เลย`
            : "ถามข้อมูลลูกค้าและการทำนายจากฐานข้อมูลได้เลย"}
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPrompt(p)}
            className="rounded-control border border-border bg-surface px-3 py-2.5 text-left text-micro text-text transition-colors hover:bg-raised"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoConversation({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <MessageSquare size={36} className="text-faint" />
      <div className="text-center">
        <p className="text-body font-medium text-text">ยังไม่มีการสนทนา</p>
        <p className="mt-1 text-micro text-faint">สร้างแชทใหม่เพื่อเริ่มต้น</p>
      </div>
      {/* the sidebar's button is the page's one primary action */}
      <button type="button" onClick={onCreate} className={BUTTON.secondary}>
        <Plus size={14} /> แชทใหม่
      </button>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export function AIChatView() {
  const {
    config, conversations, activeId, messages, streaming, sending, thinkingStep,
    send, cancel, createConversation, selectConversation, loadConfig,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const { runs } = useActiveRun();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, thinkingStep]);

  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      const firstActive = conversations.find((c) => !c.archived);
      if (firstActive) selectConversation(firstActive.id);
    }
  }, [conversations, activeId, selectConversation]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput("");
    await send(msg);
    inputRef.current?.focus();
  }, [input, send]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) handleSend();
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const showMessages = messages.length > 0 || streaming !== null;
  const statusLine = activeConv?.run_id && activeConv.run_name
    ? `Run “${activeConv.run_name}”`
    : config?.configured
      ? `${config.provider} · ${config.model}`
      : "ตั้งค่า LLM ก่อนใช้งาน";

  return (
    <div className={`relative flex min-h-0 overflow-hidden bg-ground ${VIEWPORT}`}>
      {chatSidebarOpen && (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-text/20 md:hidden"
          onClick={() => setChatSidebarOpen(false)}
          aria-label="ปิดรายการสนทนา"
        />
      )}
      <Sidebar runs={runs} mobileOpen={chatSidebarOpen} onClose={() => setChatSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-5">
          <button
            type="button"
            onClick={() => setChatSidebarOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text hover:bg-raised md:hidden"
            aria-label="เปิดรายการสนทนา"
            aria-expanded={chatSidebarOpen}
          >
            <Menu size={16} strokeWidth={1.5} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-soft sm:flex">
              <Bot size={14} strokeWidth={1.5} className="text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-body font-semibold text-text">
                {activeConv?.title ?? "ผู้ช่วย AI"}
              </h2>
              <p className="truncate text-micro text-faint">{statusLine}</p>
            </div>
          </div>
          {sending && (
            <button
              type="button"
              onClick={cancel}
              className={BUTTON.secondary}
            >
              <X size={12} /> หยุด
            </button>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-ground px-4 py-5 sm:px-6">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
            {!activeId ? (
              <NoConversation onCreate={() => createConversation()} />
            ) : !showMessages ? (
              <EmptyState onPrompt={(p) => handleSend(p)} runName={activeConv?.run_name ?? null} />
            ) : (
              <div className="space-y-5 pb-2">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex min-w-0 gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "assistant" ? (
                      <AssistantAvatar />
                    ) : (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface">
                        <User size={13} strokeWidth={1.5} className="text-muted" />
                      </div>
                    )}
                    <div className={["flex min-w-0 max-w-[min(80%,48rem)] flex-col gap-1", msg.role === "user" ? "items-end" : "items-start"].join(" ")}>
                      <span className="px-1 text-micro text-faint">
                        {msg.role === "assistant" ? "ผู้ช่วย AI" : "คุณ"} · {formatTime(msg.ts)}
                      </span>
                      <div
                        className={[
                          "min-w-0 rounded-card px-4 py-3 text-small leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-ink"
                            : msg.error
                              ? "border border-border bg-[var(--pill-negative-bg)] text-negative"
                              : "border border-border bg-surface text-text",
                        ].join(" ")}
                      >
                        {msg.role === "user" ? (
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                        ) : (
                          <MarkdownLite text={msg.content || "​"} strongClassName="font-semibold text-text" />
                        )}
                      </div>
                      {msg.role === "assistant" && !msg.error && msg.evidence && (
                        <div className="w-full max-w-full">
                          <EvidencePanel evidence={msg.evidence} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {streaming && streaming.content && (
                  <div className="flex min-w-0 gap-3">
                    <AssistantAvatar />
                    <div className="flex min-w-0 max-w-[min(80%,48rem)] flex-col items-start gap-1">
                      <span className="px-1 text-micro text-faint">ผู้ช่วย AI</span>
                      <div className="min-w-0 rounded-card border border-border bg-surface px-4 py-3 text-small leading-relaxed text-text">
                        <MarkdownLite text={streaming.content} strongClassName="font-semibold text-text" />
                        <span className="ml-0.5 inline-block h-3.5 w-0.5 rounded-full bg-accent" />
                      </div>
                    </div>
                  </div>
                )}

                {thinkingStep && <ThinkingBubble message={thinkingStep.message} />}
                {sending && !thinkingStep && !streaming?.content && <ThinkingBubble message="กำลังวิเคราะห์…" />}
              </div>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-2 rounded-control border border-control bg-surface px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                rows={1}
                disabled={sending}
                placeholder={activeId ? "ถามเรื่องข้อมูลลูกค้า… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)" : "สร้างแชทใหม่ก่อนเริ่มสนทนา"}
                className="max-h-[160px] min-h-[28px] flex-1 resize-none bg-transparent text-small leading-relaxed text-text outline-none placeholder:text-faint"
                style={{ overflowY: "auto" }}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                aria-label="ส่งข้อความ"
                className={[
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors",
                  input.trim() && !sending
                    ? "bg-primary text-primary-ink hover:opacity-90"
                    : "cursor-not-allowed bg-raised text-faint",
                ].join(" ")}
              >
                <Send size={14} strokeWidth={1.5} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-micro text-faint">
              ผู้ช่วย AI อาจผิดพลาด — ตรวจสอบข้อมูลสำคัญเสมอ
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
