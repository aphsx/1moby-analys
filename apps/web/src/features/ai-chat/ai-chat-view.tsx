"use client";

import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  Edit3,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Target,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { TypingDots } from "@/components/chat/typing-dots";
import { fetchPredictionRuns, type PredictionRun } from "@/lib/ml-api";
import {
  type ChatEvidence,
  type Conversation,
  formatTime,
  useChatStore,
} from "@/stores/chat-store";

const VIEWPORT = "h-[calc(100dvh-4rem)]";

// ── Run badge ────────────────────────────────────────────────────────────────
function RunBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full bg-[color:var(--moby-50)] px-1.5 py-0.5 font-medium text-[9.5px] text-[color:var(--moby-700)]"
      title={`ผูกกับ run: ${name}`}
    >
      <Target className="shrink-0" size={9} />
      <span className="truncate">{name}</span>
    </span>
  );
}

// ── Sidebar conversation item ──────────────────────────────────────────────────
function ConversationItem({
  conv,
  active,
  onSelect,
  onRename,
  onArchive,
  onDelete,
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
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== conv.title) {
      onRename(t);
    }
    setEditing(false);
  };

  return (
    <div
      className={[
        "group flex min-w-0 cursor-pointer flex-col gap-1 rounded-xl px-3 py-2.5 transition-colors",
        active
          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-700)]"
          : "text-[color:var(--ink-3)] hover:bg-gray-100",
      ].join(" ")}
      onClick={editing ? undefined : onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MessageSquare
          className={
            active
              ? "shrink-0 text-[color:var(--moby-500)]"
              : "shrink-0 opacity-50"
          }
          size={13}
        />
        {editing ? (
          <input
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            onBlur={commitRename}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitRename();
              }
              if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            ref={inputRef}
            value={draft}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px]">
            {conv.title}
          </span>
        )}
        {!editing && (
          <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
            <button
              className="rounded p-0.5 hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                setDraft(conv.title);
              }}
              title="เปลี่ยนชื่อ"
              type="button"
            >
              <Edit3 size={11} />
            </button>
            <button
              className="rounded p-0.5 hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              title={conv.archived ? "เลิก archive" : "Archive"}
              type="button"
            >
              {conv.archived ? (
                <ArchiveRestore size={11} />
              ) : (
                <Archive size={11} />
              )}
            </button>
            <button
              className="rounded p-0.5 text-red-400 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="ลบ"
              type="button"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {conv.runId && conv.runName && (
        <div className="pl-[21px]">
          <RunBadge name={conv.runName} />
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({ runs }: { runs: PredictionRun[] }) {
  const {
    conversations,
    activeId,
    showArchived,
    pendingRunId,
    loadConversations,
    createConversation,
    selectConversation,
    renameConversation,
    archiveConversation,
    deleteConversation,
    setPendingRun,
    setShowArchived,
  } = useChatStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => c.archived === showArchived)
      .filter(
        (c) =>
          !q ||
          c.title.toLowerCase().includes(q) ||
          (c.runName ?? "").toLowerCase().includes(q)
      );
  }, [conversations, showArchived, query]);

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-gray-200 border-r bg-[#fafafa]">
      <div className="space-y-2 p-3">
        {/* Scope picker for the next new chat */}
        <div className="relative">
          <select
            className="h-8 w-full appearance-none rounded-lg border border-gray-200 bg-white pr-7 pl-2.5 text-[11.5px] text-[color:var(--ink-3)] outline-none hover:border-[color:var(--moby-200)]"
            onChange={(e) => setPendingRun(e.target.value || null)}
            title="ขอบเขตข้อมูลของแชทใหม่"
            value={pendingRunId ?? ""}
          >
            <option value="">ทุก run (global)</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.cutoff_date}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ink-5)]"
            size={12}
          />
        </div>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--moby-600)] px-3 py-2.5 font-semibold text-[12.5px] text-white transition-colors hover:bg-[color:var(--moby-700)] active:scale-[0.98]"
          onClick={() => createConversation()}
          type="button"
        >
          <Plus size={14} /> New Chat
        </button>

        <div className="relative">
          <Search
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ink-5)]"
            size={12}
          />
          <input
            className="h-8 w-full rounded-lg border border-gray-200 bg-white pr-2 pl-7 text-[11.5px] text-[color:var(--ink-2)] outline-none placeholder:text-[color:var(--ink-5)] focus:border-[color:var(--moby-200)]"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาแชท…"
            value={query}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-[color:var(--ink-5)]">
            {showArchived ? "ไม่มีแชทที่ archive" : "ยังไม่มีการสนทนา"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {visible.map((conv) => (
              <ConversationItem
                active={conv.id === activeId}
                conv={conv}
                key={conv.id}
                onArchive={() => archiveConversation(conv.id, !conv.archived)}
                onDelete={() => deleteConversation(conv.id)}
                onRename={(title) => renameConversation(conv.id, title)}
                onSelect={() => selectConversation(conv.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-gray-200 border-t px-3 py-2.5">
        <button
          className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--ink-4)] hover:text-[color:var(--moby-600)]"
          onClick={() => setShowArchived(!showArchived)}
          type="button"
        >
          {showArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
          {showArchived ? "แชทใช้งาน" : "Archived"}
        </button>
        <span className="text-[10px] text-[color:var(--ink-5)]">
          Text-to-SQL + Gen AI
        </span>
      </div>
    </aside>
  );
}

// ── Evidence panel ─────────────────────────────────────────────────────────────
function EvidencePanel({ evidence }: { evidence: ChatEvidence }) {
  const [open, setOpen] = useState(false);
  const hasData =
    evidence.sql || evidence.row_count > 0 || evidence.warnings.length > 0;
  if (!hasData) {
    return null;
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-[#f8fafc]">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-[color:var(--ink-4)] transition-colors hover:bg-gray-100"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Database className="shrink-0 text-[color:var(--moby-500)]" size={11} />
        <span className="flex-1 text-left font-medium">
          {evidence.mode === "text_to_sql"
            ? `SQL · ${evidence.row_count} row${evidence.row_count === 1 ? "" : "s"}`
            : "Direct answer"}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <div className="space-y-2 border-gray-200 border-t p-3">
          {evidence.sql && (
            <div>
              <p className="mb-1 font-semibold text-[10px] text-[color:var(--ink-5)] uppercase tracking-wider">
                SQL
              </p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] text-green-300 leading-relaxed">
                <code>{evidence.sql}</code>
              </pre>
            </div>
          )}
          {evidence.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertCircle
                className="mt-0.5 shrink-0 text-amber-500"
                size={12}
              />
              <p className="text-[11px] text-amber-700">
                {evidence.warnings.join(" · ")}
              </p>
            </div>
          )}
          {evidence.row_count > 0 && evidence.columns.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-[10px] text-[color:var(--ink-5)] uppercase tracking-wider">
                Result · {evidence.row_count} rows
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      {evidence.columns.map((col) => (
                        <th
                          className="border-gray-200 border-b px-2 py-1.5 text-left font-semibold text-[color:var(--ink-3)]"
                          key={col}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(evidence.rows as Record<string, unknown>[])
                      .slice(0, 20)
                      .map((row, ri) => (
                        <tr className="hover:bg-gray-50" key={ri}>
                          {evidence.columns.map((col) => (
                            <td
                              className="px-2 py-1.5 text-[color:var(--ink-4)]"
                              key={col}
                            >
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {evidence.row_count > 20 && (
                  <p className="px-3 py-1.5 text-[10px] text-[color:var(--ink-5)]">
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
    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] shadow-sm">
      <Bot className="text-white" size={13} />
    </div>
  );
}

function ThinkingBubble({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] shadow-md">
        <Loader2 className="animate-spin text-white" size={15} />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-[12px] text-[color:var(--ink-4)]">{message}</span>
        <TypingDots />
      </div>
    </div>
  );
}

function EmptyState({
  onPrompt,
  runName,
}: {
  onPrompt: (p: string) => void;
  runName: string | null;
}) {
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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--moby-500)] to-[color:var(--moby-700)] shadow-lg">
        <Bot className="text-white" size={28} />
      </div>
      <div className="text-center">
        <h2 className="font-semibold text-[17px] text-[color:var(--ink-1)]">
          Moby AI
        </h2>
        <p className="mt-1 text-[13px] text-[color:var(--ink-4)]">
          {runName
            ? `ถามข้อมูลของ run “${runName}” ได้เลย`
            : "ถามข้อมูล analytics จากฐานข้อมูลได้เลย"}
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        {prompts.map((p) => (
          <button
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[12px] text-[color:var(--ink-3)] transition-colors hover:border-[color:var(--moby-300)] hover:bg-[color:var(--moby-50)] hover:text-[color:var(--moby-700)]"
            key={p}
            onClick={() => onPrompt(p)}
            type="button"
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
      <MessageSquare className="text-gray-300" size={36} />
      <div className="text-center">
        <p className="font-medium text-[14px] text-[color:var(--ink-3)]">
          ยังไม่มีการสนทนา
        </p>
        <p className="mt-1 text-[12px] text-[color:var(--ink-5)]">
          สร้าง New Chat เพื่อเริ่มต้น
        </p>
      </div>
      <button
        className="flex items-center gap-2 rounded-xl bg-[color:var(--moby-600)] px-4 py-2.5 font-semibold text-[13px] text-white hover:bg-[color:var(--moby-700)]"
        onClick={onCreate}
        type="button"
      >
        <Plus size={14} /> New Chat
      </button>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export function AIChatView() {
  const {
    config,
    conversations,
    activeId,
    messages,
    streaming,
    sending,
    thinkingStep,
    send,
    cancel,
    createConversation,
    selectConversation,
    loadConfig,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    let alive = true;
    fetchPredictionRuns()
      .then(
        (all) => alive && setRuns(all.filter((r) => r.status === "completed"))
      )
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming, thinkingStep]);

  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      const firstActive = conversations.find((c) => !c.archived);
      if (firstActive) {
        selectConversation(firstActive.id);
      }
    }
  }, [conversations, activeId, selectConversation]);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg) {
        return;
      }
      setInput("");
      await send(msg);
      inputRef.current?.focus();
    },
    [input, send]
  );

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) {
        handleSend();
      }
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const showMessages = messages.length > 0 || streaming !== null;
  const statusLine =
    activeConv?.runId && activeConv.runName
      ? `Run “${activeConv.runName}”`
      : config?.configured
        ? `${config.provider} · ${config.model}`
        : "ตั้งค่า LLM ก่อนใช้งาน";

  return (
    <div
      className={`flex min-h-0 overflow-hidden bg-[color:var(--bg)] ${VIEWPORT}`}
    >
      <Sidebar runs={runs} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex shrink-0 items-center gap-3 border-gray-200 border-b bg-white px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[color:var(--moby-500)] to-[color:var(--moby-700)]">
              <Bot className="text-white" size={14} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-[14px] text-[color:var(--ink-1)]">
                {activeConv?.title ?? "Moby AI"}
              </h2>
              <p className="truncate text-[11px] text-[color:var(--ink-5)]">
                {statusLine}
              </p>
            </div>
          </div>
          {sending && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-[color:var(--ink-3)] hover:bg-gray-50"
              onClick={cancel}
              type="button"
            >
              <X size={12} /> หยุด
            </button>
          )}
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8fafc] px-4 py-4"
          ref={scrollRef}
        >
          <div className="mx-auto w-full max-w-3xl">
            {activeId ? (
              showMessages ? (
                <div className="space-y-5">
                  {messages.map((msg) => (
                    <div
                      className={`flex min-w-0 gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                      key={msg.id}
                    >
                      {msg.role === "assistant" ? (
                        <AssistantAvatar />
                      ) : (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
                          <User
                            className="text-[color:var(--ink-4)]"
                            size={13}
                          />
                        </div>
                      )}
                      <div
                        className={[
                          "flex min-w-0 max-w-[min(80%,48rem)] flex-col gap-1",
                          msg.role === "user" ? "items-end" : "items-start",
                        ].join(" ")}
                      >
                        <span className="px-1 text-[10.5px] text-[color:var(--ink-5)]">
                          {msg.role === "assistant" ? "Moby AI" : "You"} ·{" "}
                          {formatTime(msg.ts)}
                        </span>
                        <div
                          className={[
                            "min-w-0 rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                            msg.role === "user"
                              ? "rounded-tr-sm bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white"
                              : msg.error
                                ? "rounded-tl-sm border border-red-200 bg-red-50 text-red-700"
                                : "rounded-tl-sm border border-gray-200 bg-white text-[color:var(--ink-2)] shadow-sm",
                          ].join(" ")}
                        >
                          {msg.role === "user" ? (
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {msg.content}
                            </p>
                          ) : (
                            <MarkdownLite
                              strongClassName="font-semibold text-[color:var(--ink-1)]"
                              text={msg.content || "​"}
                            />
                          )}
                        </div>
                        {msg.role === "assistant" &&
                          !msg.error &&
                          msg.evidence && (
                            <div className="w-full max-w-full">
                              <EvidencePanel evidence={msg.evidence} />
                            </div>
                          )}
                      </div>
                    </div>
                  ))}

                  {/* Streaming assistant bubble (committed once on done) */}
                  {streaming?.content && (
                    <div className="flex min-w-0 gap-3">
                      <AssistantAvatar />
                      <div className="flex min-w-0 max-w-[min(80%,48rem)] flex-col items-start gap-1">
                        <span className="px-1 text-[10.5px] text-[color:var(--ink-5)]">
                          Moby AI
                        </span>
                        <div className="min-w-0 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 text-[13px] text-[color:var(--ink-2)] leading-relaxed shadow-sm">
                          <MarkdownLite
                            strongClassName="font-semibold text-[color:var(--ink-1)]"
                            text={streaming.content}
                          />
                          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-[color:var(--moby-500)]" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Thinking (planner / sql / answer) */}
                  {thinkingStep && (
                    <ThinkingBubble message={thinkingStep.message} />
                  )}
                  {sending && !thinkingStep && !streaming?.content && (
                    <ThinkingBubble message="กำลังวิเคราะห์…" />
                  )}
                </div>
              ) : (
                <EmptyState
                  onPrompt={(p) => handleSend(p)}
                  runName={activeConv?.runName ?? null}
                />
              )
            ) : (
              <NoConversation onCreate={() => createConversation()} />
            )}
          </div>
        </div>

        <footer className="shrink-0 border-gray-200 border-t bg-white px-4 py-3">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-[color:var(--moby-300)]">
              <textarea
                className="max-h-[160px] min-h-[28px] flex-1 resize-none bg-transparent text-[13.5px] text-[color:var(--ink-2)] leading-relaxed outline-none placeholder:text-[color:var(--ink-5)]"
                disabled={sending}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                placeholder={
                  activeId
                    ? "ถามข้อมูล analytics… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)"
                    : "สร้าง New Chat ก่อนเริ่มสนทนา"
                }
                ref={inputRef}
                rows={1}
                style={{ overflowY: "auto" }}
                value={input}
              />
              <button
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                  input.trim() && !sending
                    ? "bg-[color:var(--moby-600)] text-white shadow-sm hover:bg-[color:var(--moby-700)] active:scale-95"
                    : "cursor-not-allowed bg-gray-100 text-[color:var(--ink-5)]",
                ].join(" ")}
                disabled={!input.trim() || sending}
                onClick={() => handleSend()}
                type="button"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10.5px] text-[color:var(--ink-6)]">
              Moby AI อาจผิดพลาด — ตรวจสอบข้อมูลสำคัญเสมอ
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
