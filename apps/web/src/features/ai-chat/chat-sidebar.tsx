"use client";
/** Conversation list of the AI chat page: search, rename, archive, delete, bind to a run. */
import { type PredictionRun } from "@moby/types";
import { memo, useState, useRef, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit3, MessageSquare, Search, Archive, ArchiveRestore, Target } from "lucide-react";
import { Select } from "@/components/select";
import { useShallow } from "zustand/react/shallow";
import { useChatStore, type Conversation } from "@/stores/chat-store";

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
export const ChatSidebar = memo(function ChatSidebar({
  runs,
  mobileOpen = false,
  onClose,
}: {
  runs: PredictionRun[];
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  // Only what the list shows: streamed tokens change other store fields and must not re-render it
  const {
    conversations, activeId, showArchived, pendingRunId, conversationsError,
    loadConversations, createConversation, selectConversation,
    renameConversation, archiveConversation, deleteConversation,
    setPendingRun, setShowArchived,
  } = useChatStore(
    useShallow((s) => ({
      conversations: s.conversations, activeId: s.activeId, showArchived: s.showArchived, pendingRunId: s.pendingRunId,
      conversationsError: s.conversationsError,
      loadConversations: s.loadConversations, createConversation: s.createConversation, selectConversation: s.selectConversation,
      renameConversation: s.renameConversation, archiveConversation: s.archiveConversation, deleteConversation: s.deleteConversation,
      setPendingRun: s.setPendingRun, setShowArchived: s.setShowArchived,
    }))
  );
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
        {conversationsError ? (
          <p className="px-3 py-6 text-center text-micro text-negative">
            {conversationsError}{" "}
            <button type="button" onClick={() => void loadConversations()} className="underline underline-offset-2">
              ลองอีกครั้ง
            </button>
          </p>
        ) : visible.length === 0 ? (
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
});
