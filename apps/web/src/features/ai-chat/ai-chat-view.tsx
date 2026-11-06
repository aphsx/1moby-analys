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
      className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full bg-accent-soft px-1.5 py-0.5 text-micro font-medium text-accent"
    >
      <Target size={9} className="shrink-0" />
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
        "group flex min-w-0 cursor-pointer flex-col gap-1 rounded-control px-3 py-2.5 transition-colors",
        active
          ? "bg-accent-soft text-accent"
          : "text-text hover:bg-raised",
      ].join(" ")}
      onClick={editing ? undefined : onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MessageSquare size={13} className={active ? "shrink-0 text-accent" : "shrink-0 opacity-50"} />
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
    <aside className={`absolute inset-y-0 left-0 z-40 flex h-full w-[min(86vw,280px)] shrink-0 flex-col border-r border-border bg-ground transition-transform duration-200 md:static md:z-auto md:w-[240px] md:translate-x-0 md:shadow-none ${
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
          onClick={() => {
            createConversation();
            onClose?.();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-control bg-accent px-3 py-2.5 text-small font-semibold text-white transition-colors hover:bg-accent active:scale-[0.98]"
        >
          <Plus size={14} /> แชทใหม่
        </button>

        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาแชท…"
            className="h-8 w-full rounded-lg border border-border bg-surface pl-7 pr-2 text-micro text-text outline-none placeholder:text-faint focus:border-accent-track"
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
    <div className="mt-2 overflow-hidden rounded-control border border-border bg-[#f8fafc]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-micro text-muted transition-colors hover:bg-raised"
      >
        <Database size={11} className="shrink-0 text-accent" />
        <span className="flex-1 text-left font-medium">
          {evidence.mode === "text_to_sql"
            ? `SQL · ${evidence.row_count} row${evidence.row_count !== 1 ? "s" : ""}`
            : "ตอบโดยตรง"}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {evidence.sql && (
            <div>
              <p className="mb-1 text-micro font-semibold text-faint">SQL</p>
              <pre className="overflow-x-auto rounded-control bg-raised p-3 text-micro leading-relaxed text-text">
                <code>{evidence.sql}</code>
              </pre>
            </div>
          )}
          {evidence.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-[var(--pill-warning-bg)] px-3 py-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-micro text-warning">{evidence.warnings.join(" · ")}</p>
            </div>
          )}
          {evidence.row_count > 0 && evidence.columns.length > 0 && (
            <div>
              <p className="mb-1 text-micro font-semibold text-faint">
                Result · {evidence.row_count} rows
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-micro">
                  <thead className="bg-raised">
                    <tr>
                      {evidence.columns.map((col) => (
                        <th key={col} className="border-b border-border px-2 py-1.5 text-left font-semibold text-text">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {(evidence.rows as Record<string, unknown>[]).slice(0, 20).map((row, ri) => (
                      <tr key={ri} className="hover:bg-raised">
                        {evidence.columns.map((col) => (
                          <td key={col} className="px-2 py-1.5 text-muted">
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evidence.row_count > 20 && (
                  <p className="px-3 py-1.5 text-micro text-faint">
                    + {evidence.row_count - 20} more rows
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
    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent">
      <Bot size={13} className="text-white" />
    </div>
  );
}

function ThinkingBubble({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent">
        <Loader2 size={15} className="animate-spin text-white" />
      </div>
      <div className="flex items-center gap-2 rounded-card rounded-tl-sm border border-border bg-surface px-4 py-3">
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-card bg-accent">
        <Bot size={28} className="text-white" />
      </div>
      <div className="text-center">
        <h2 className="text-[17px] font-semibold text-text">Moby AI</h2>
        <p className="mt-1 text-small text-muted">
          {runName ? `ถามข้อมูลของ run “${runName}” ได้เลย` : "ถามข้อมูล analytics จากฐานข้อมูลได้เลย"}
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => onPrompt(p)}
            className="rounded-control border border-border bg-surface px-3 py-2.5 text-left text-micro text-text transition-colors hover:border-accent-track hover:bg-accent-soft hover:text-accent"
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
          className="absolute inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setChatSidebarOpen(false)}
          aria-label="ปิดรายการสนทนา"
        />
      )}
      <Sidebar runs={runs} mobileOpen={chatSidebarOpen} onClose={() => setChatSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <button
            type="button"
            onClick={() => setChatSidebarOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text hover:bg-raised md:hidden"
            aria-label="เปิดรายการสนทนา"
            aria-expanded={chatSidebarOpen}
          >
            <Menu size={16} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Bot size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-body font-semibold text-text">
                {activeConv?.title ?? "Moby AI"}
              </h2>
              <p className="truncate text-micro text-faint">{statusLine}</p>
            </div>
          </div>
          {sending && (
            <button
              onClick={cancel}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-micro text-text hover:bg-raised"
            >
              <X size={12} /> หยุด
            </button>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8fafc] px-4 py-4">
          <div className="mx-auto w-full max-w-3xl">
            {!activeId ? (
              <NoConversation onCreate={() => createConversation()} />
            ) : !showMessages ? (
              <EmptyState onPrompt={(p) => handleSend(p)} runName={activeConv?.run_name ?? null} />
            ) : (
              <div className="space-y-5">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex min-w-0 gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "assistant" ? (
                      <AssistantAvatar />
                    ) : (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface">
                        <User size={13} className="text-muted" />
                      </div>
                    )}
                    <div className={["flex min-w-0 flex-col gap-1 max-w-[min(80%,48rem)]", msg.role === "user" ? "items-end" : "items-start"].join(" ")}>
                      <span className="px-1 text-micro text-faint">
                        {msg.role === "assistant" ? "Moby AI" : "คุณ"} · {formatTime(msg.ts)}
                      </span>
                      <div
                        className={[
                          "min-w-0 rounded-card px-4 py-3 text-small leading-relaxed",
                          msg.role === "user"
                            ? "rounded-tr-sm bg-accent text-white"
                            : msg.error
                              ? "rounded-tl-sm border border-border bg-[var(--pill-negative-bg)] text-negative"
                              : "rounded-tl-sm border border-border bg-surface text-text",
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

                {/* Streaming assistant bubble (committed once on done) */}
                {streaming && streaming.content && (
                  <div className="flex min-w-0 gap-3">
                    <AssistantAvatar />
                    <div className="flex min-w-0 max-w-[min(80%,48rem)] flex-col items-start gap-1">
                      <span className="px-1 text-micro text-faint">Moby AI</span>
                      <div className="min-w-0 rounded-card rounded-tl-sm border border-border bg-surface px-4 py-3 text-small leading-relaxed text-text">
                        <MarkdownLite text={streaming.content} strongClassName="font-semibold text-text" />
                        <span className="ml-0.5 inline-block h-3.5 w-0.5 rounded-full bg-accent" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Thinking (planner / sql / answer) */}
                {thinkingStep && <ThinkingBubble message={thinkingStep.message} />}
                {sending && !thinkingStep && !streaming?.content && <ThinkingBubble message="กำลังวิเคราะห์…" />}
              </div>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-surface px-4 py-3">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-3 rounded-card border border-border bg-surface px-4 py-3 transition-colors focus-within:ring-1 focus-within:ring-accent-track">
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
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-control transition-[background-color,transform]",
                  input.trim() && !sending
                    ? "bg-accent text-white hover:bg-accent active:scale-95"
                    : "cursor-not-allowed bg-raised text-faint",
                ].join(" ")}
              >
                <Send size={14} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-micro text-faint">
              Moby AI อาจผิดพลาด — ตรวจสอบข้อมูลสำคัญเสมอ
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
