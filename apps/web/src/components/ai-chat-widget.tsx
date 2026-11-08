/**
 * AIChatWidget — Floating AI chat bubble (bottom-right)
 *
 * Layout pattern follows common open-source messenger widgets such as
 * Wolox/react-chat-widget: a fixed shell with non-shrinking header/footer
 * and one scrollable message viewport.
 *
 * The conversation itself lives in the shared chat store, so the widget
 * and the /ai-chat full page continue the same thread.
 *
 * Structure:
 *   [wrapper: fixed, flex-col, responsive width/height]
 *     ├── [header:   flex-shrink-0           ]  ← always visible, never shrinks
 *     ├── [messages: flex-1, min-h-0,
 *     │              overflow-y-auto          ]  ← fills remaining space, scrolls
 *     └── [footer:   flex-shrink-0           ]  ← always visible, never shrinks
 *           ├── [chips row]
 *           └── [composer row]
 */
"use client";

import {
  useState, useRef, useEffect,
  type KeyboardEvent, type ChangeEvent,
} from "react";
import {
  Bot, X, Send, Sparkles,
  RotateCcw, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { TypingDots } from "@/components/chat/typing-dots";
import { formatTime } from "@/lib/format";
import { useChatStore, type ChatMsg } from "@/stores/chat-store";

/* ─────────────────────────────────────────────
   Suggested chips  (only shown on first load)
───────────────────────────────────────────── */
const CHIPS = ["ดูความเสี่ยงเลิกใช้", "ดูมูลค่าลูกค้า", "ดูสถานะลูกค้า", "ดูความแม่นยำโมเดล"];

const PANEL_SIZE =
  "w-[calc(100vw-24px)] h-[min(620px,calc(100dvh-24px))] sm:w-[390px] sm:h-[min(640px,calc(100dvh-48px))]";

const TEXT_WRAP =
  "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function Avatar() {
  return (
    <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent-soft">
      <Bot size={13} strokeWidth={1.5} className="text-accent" />
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex min-w-0 items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && <Avatar />}
      <div className={`flex min-w-0 max-w-[82%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "max-w-full px-3.5 py-2.5 text-small leading-relaxed",
            TEXT_WRAP,
            isUser
              ? "rounded-card bg-primary text-primary-ink"
              : "rounded-card border border-border bg-surface text-text",
          ].join(" ")}
        >
          <MarkdownLite text={msg.content} />
        </div>
        <span className="px-1 text-micro text-faint">{formatTime(msg.ts)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AIChatWidget
═══════════════════════════════════════════════════════════ */
export default function AIChatWidget() {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const thinkingStep = useChatStore((s) => s.thinkingStep);
  const sending = useChatStore((s) => s.sending);
  const unread = useChatStore((s) => s.unread);
  const open = useChatStore((s) => s.widgetOpen);
  const setOpen = useChatStore((s) => s.setWidgetOpen);
  const sendMessage = useChatStore((s) => s.send);
  const resetChat = useChatStore((s) => s.reset);
  const config = useChatStore((s) => s.config);
  const loadConfig = useChatStore((s) => s.loadConfig);

  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* load LLM config once for the header status line */
  useEffect(() => {
    if (!config) loadConfig();
  }, [config, loadConfig]);

  /* auto-scroll to bottom */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, thinkingStep, sending]);

  /* focus on open (badge clears in the store) */
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  /* auto-resize textarea — cross-browser, no fieldSizing needed */
  const resizeTA = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTA();
  };

  const send = (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendMessage(text);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const firstLoad = messages.length === 0 && !streaming && !sending;
  const statusLabel = config?.configured
    ? `${config.provider} · ${config.model}`
    : config
      ? "ยังไม่ได้ตั้งค่า LLM"
      : "กำลังเชื่อมต่อ…";

  return (
    <>
      {/* ══ FAB bubble ═══════════════════════════════════════ */}
      <button
        id="ai-chat-bubble"
        aria-label="เปิดผู้ช่วย AI"
        onClick={() => setOpen(!open)}
        className={[
          "fixed bottom-3 right-3 z-50 sm:bottom-6 sm:right-6",
          "flex h-12 w-12 items-center justify-center rounded-card",
          "border border-border bg-surface text-accent",
          "transition-[transform,background-color] duration-200",
          "hover:bg-accent-soft active:scale-95",
          open ? "pointer-events-none scale-90 opacity-0" : "opacity-100",
        ].join(" ")}
      >
        <Bot size={20} strokeWidth={1.5} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--pill-negative-bg)] px-1 text-micro font-medium leading-none text-[var(--pill-negative-ink)]">
            {unread}
          </span>
        )}
      </button>

      {/* ══ Chat panel ═══════════════════════════════════════
          Layout rules (common messenger widget pattern):
            • wrapper   → flex flex-col, FIXED size, overflow-hidden
            • header    → flex-shrink-0  (never shrinks)
            • messages  → flex-1 min-h-0 overflow-y-auto  (fills gap, scrolls)
            • footer    → flex-shrink-0  (never shrinks)
      ════════════════════════════════════════════════════════ */}
      <div
        aria-label="แชทผู้ช่วย AI"
        className={[
          "fixed inset-x-3 bottom-3 z-50 origin-bottom-right sm:inset-x-auto sm:bottom-6 sm:right-6",
          PANEL_SIZE,
          "flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-[var(--shadow-float)]",
          "transition-[transform,opacity] duration-200",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-90 opacity-0",
        ].join(" ")}
      >

        {/* ── HEADER (flex-shrink-0) ─────────────────────── */}
        <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-soft">
            <Sparkles size={14} strokeWidth={1.5} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-small font-semibold leading-tight text-text">ผู้ช่วย AI</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-micro text-faint">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${config?.configured ? "bg-positive" : "bg-warning"}`} />
              {statusLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Link
              href="/ai-chat"
              title="เปิดเต็มจอ"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-text"
            >
              <ExternalLink size={12} strokeWidth={1.5} />
            </Link>
            <button
              type="button"
              onClick={resetChat}
              title="รีเซ็ต"
              className="flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-text"
            >
              <RotateCcw size={12} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="ปิด"
              className="flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-text"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* ── MESSAGES (flex-1 + min-h-0 = fills space, scrolls)
            min-h-0 is REQUIRED — without it, flex-1 overflows the parent
        ─────────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-ground px-3 py-4 sm:px-4"
        >
          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} />
          ))}

          {streaming && streaming.content && (
            <div className="flex min-w-0 items-end gap-2">
              <Avatar />
              <div className={[
                "max-w-[82%] border border-border bg-surface px-3.5 py-2.5 text-small leading-relaxed text-text",
                TEXT_WRAP,
                "rounded-card",
              ].join(" ")}>
                <MarkdownLite text={streaming.content} />
              </div>
            </div>
          )}

          {sending && !streaming?.content && (
            <div className="flex items-end gap-2">
              <Avatar />
              <div className="flex max-w-[82%] items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
                {thinkingStep && <span className="text-micro text-muted">{thinkingStep.message}</span>}
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-col border-t border-border bg-surface">
          {firstLoad && (
            <div className="flex gap-2 overflow-x-auto px-3 pt-2.5">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => send(chip)}
                  className="shrink-0 whitespace-nowrap rounded-control border border-border bg-surface px-2.5 py-1.5 text-micro text-text transition-colors hover:bg-raised"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-3">
            <div className="flex min-w-0 flex-1 items-end rounded-control border border-control bg-surface px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              <textarea
                ref={textareaRef}
                id="ai-chat-input"
                rows={1}
                value={input}
                onChange={handleChange}
                onKeyDown={onKey}
                placeholder="ถามผู้ช่วย AI"
                className="max-h-[96px] min-h-[20px] flex-1 resize-none bg-transparent text-small leading-[1.5] text-text outline-none placeholder:text-faint [overflow-wrap:anywhere] whitespace-pre-wrap break-words"
                style={{ overflowY: "auto" }}
              />
            </div>

            <button
              id="ai-chat-send"
              type="button"
              aria-label="ส่งข้อความ"
              onClick={() => send()}
              disabled={!input.trim() || sending}
              className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors",
                input.trim() && !sending
                  ? "bg-primary text-primary-ink hover:opacity-90"
                  : "cursor-not-allowed bg-raised text-faint",
              ].join(" ")}
            >
              <Send size={14} strokeWidth={1.5} />
            </button>
          </div>

          <p className="px-4 pb-2 text-center text-micro leading-tight text-faint">
            <Link
              href="/ai-chat"
              className="text-accent-ink underline-offset-2 hover:underline"
              onClick={() => setOpen(false)}
            >
              เปิดเต็มจอ
            </Link>
          </p>
        </footer>
      </div>
    </>
  );
}
