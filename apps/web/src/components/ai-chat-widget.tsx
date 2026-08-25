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

import { Bot, ExternalLink, RotateCcw, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { TypingDots } from "@/components/chat/typing-dots";
import { formatTime } from "@/lib/format";
import { type ChatMsg, useChatStore } from "@/stores/chat-store";

/* ─────────────────────────────────────────────
   Suggested chips  (only shown on first load)
───────────────────────────────────────────── */
const CHIPS = ["ดู churn risk", "ดู CLV", "ดู lifecycle", "Model health"];

const PANEL_SIZE =
  "w-[calc(100vw-24px)] h-[min(620px,calc(100dvh-24px))] sm:w-[390px] sm:h-[min(640px,calc(100dvh-48px))]";

const TEXT_WRAP =
  "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function Avatar() {
  return (
    <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--moby-600)]">
      <Bot className="text-white" size={13} />
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  const showTimestamp = msg.id !== "init";
  return (
    <div
      className={`flex min-w-0 items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {!isUser && <Avatar />}
      <div
        className={`flex min-w-0 max-w-[82%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={[
            "max-w-full px-3.5 py-2.5 text-[13px] leading-relaxed",
            TEXT_WRAP,
            isUser
              ? "rounded-2xl rounded-br-none bg-[color:var(--moby-600)] text-white"
              : "rounded-2xl rounded-bl-none border border-gray-200 bg-white text-[color:var(--ink-2)]",
          ].join(" ")}
        >
          <MarkdownLite text={msg.content} />
        </div>
        {showTimestamp && (
          <span className="px-1 text-[9.5px] text-[color:var(--ink-5)]">
            {formatTime(msg.ts)}
          </span>
        )}
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
    if (!config) {
      loadConfig();
    }
  }, [config, loadConfig]);

  /* auto-scroll to bottom */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
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
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTA();
  };

  const send = (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) {
      return;
    }
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void sendMessage(text);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
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
        aria-label="Open Moby AI"
        className={[
          "fixed right-3 bottom-3 z-50 sm:right-6 sm:bottom-6",
          "h-14 w-14 rounded-full",
          "bg-[color:var(--moby-600)]",
          "text-white",
          "flex items-center justify-center",
          "transition-all duration-200",
          "hover:scale-110 active:scale-95",
          "hover:bg-[color:var(--moby-800)]",
          open ? "pointer-events-none scale-90 opacity-0" : "opacity-100",
        ].join(" ")}
        id="ai-chat-bubble"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Bot size={22} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white leading-none">
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
        aria-label="Moby AI chat panel"
        className={[
          "fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-6 sm:bottom-6",
          PANEL_SIZE,
          "flex flex-col",
          "overflow-hidden rounded-2xl bg-white",
          "border border-gray-200",
          "origin-bottom-right transition-all duration-200",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-90 opacity-0",
        ].join(" ")}
      >
        {/* ── HEADER (flex-shrink-0) ─────────────────────── */}
        <header className="flex min-w-0 flex-shrink-0 items-center gap-3 bg-[color:var(--moby-600)] px-4 py-3">
          <div className="flex shrink-0 items-center justify-center">
            <Sparkles className="text-white" size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[13.5px] text-white leading-tight">
              Moby AI
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-white/75">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${config?.configured ? "bg-[#34d399]" : "bg-[#ffa400]"}`}
              />
              {statusLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              href="/ai-chat"
              onClick={() => setOpen(false)}
              title="เปิดเต็มจอ"
            >
              <ExternalLink size={12} />
            </Link>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              onClick={resetChat}
              title="รีเซ็ต"
              type="button"
            >
              <RotateCcw size={12} />
            </button>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              onClick={() => setOpen(false)}
              title="ปิด"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* ── MESSAGES (flex-1 + min-h-0 = fills space, scrolls)
            min-h-0 is REQUIRED — without it, flex-1 overflows the parent
        ─────────────────────────────────────────────────────── */}
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-3 py-4 sm:px-4"
          ref={scrollRef}
        >
          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} />
          ))}

          {/* Streaming assistant bubble */}
          {streaming?.content && (
            <div className="flex min-w-0 items-end gap-2">
              <Avatar />
              <div
                className={[
                  "max-w-[82%] px-3.5 py-2.5 text-[13px] leading-relaxed",
                  TEXT_WRAP,
                  "rounded-2xl rounded-bl-none border border-gray-200 bg-white text-[color:var(--ink-2)]",
                ].join(" ")}
              >
                <MarkdownLite text={streaming.content} />
              </div>
            </div>
          )}

          {/* Thinking / typing indicator */}
          {sending && !streaming?.content && (
            <div className="flex items-end gap-2">
              <Avatar />
              <div className="flex max-w-[82%] items-center gap-2 rounded-2xl rounded-bl-none border border-gray-200 bg-white px-4 py-3">
                {thinkingStep && (
                  <span className="text-[11.5px] text-[color:var(--ink-4)]">
                    {thinkingStep.message}
                  </span>
                )}
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER (flex-shrink-0) ─────────────────────────
            flex-col: chips stack above composer
        ──────────────────────────────────────────────────── */}
        <footer className="flex flex-shrink-0 flex-col border-gray-200 border-t bg-white">
          {/* Suggestion chips */}
          {firstLoad && (
            <div className="flex gap-2 overflow-x-auto px-3 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CHIPS.map((chip) => (
                <button
                  className="shrink-0 whitespace-nowrap rounded-full border border-[color:var(--moby-100)] bg-white px-2.5 py-1.5 font-medium text-[11px] text-[color:var(--moby-600)] transition-colors hover:border-[color:var(--moby-200)]"
                  key={chip}
                  onClick={() => send(chip)}
                  type="button"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Composer row */}
          <div className="flex items-end gap-2 px-3 py-3">
            <div className="flex min-w-0 flex-1 items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 focus-within:border-[color:var(--moby-200)]">
              <textarea
                className="max-h-[96px] min-h-[20px] flex-1 resize-none whitespace-pre-wrap break-words bg-transparent text-[13px] text-[color:var(--ink-2)] leading-[1.5] outline-none [overflow-wrap:anywhere] placeholder:text-[color:var(--ink-5)] focus:outline-none focus:ring-0 focus-visible:outline-none"
                id="ai-chat-input"
                onChange={handleChange}
                onKeyDown={onKey}
                placeholder="ถาม Moby AI"
                ref={textareaRef}
                rows={1}
                style={{ overflowY: "auto" }}
                value={input}
              />
            </div>

            <button
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                "transition-all duration-150",
                input.trim() && !sending
                  ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-800)] active:scale-95"
                  : "cursor-not-allowed bg-gray-200 text-[color:var(--ink-5)]",
              ].join(" ")}
              disabled={!input.trim() || sending}
              id="ai-chat-send"
              onClick={() => send()}
              type="button"
            >
              <Send size={14} strokeWidth={2} />
            </button>
          </div>

          {/* Disclaimer */}
          <p className="px-4 pb-2 text-center text-[9.5px] text-[color:var(--ink-6)] leading-tight">
            Chat API connected · no mock prediction data ·{" "}
            <Link
              className="text-[color:var(--moby-500)] hover:underline"
              href="/ai-chat"
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
