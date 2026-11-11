"use client";
/** The AI chat page: conversation sidebar, message list and composer; state lives in the chat store. */
import { useState, useRef, useEffect, useCallback, type ChangeEvent, type KeyboardEvent } from "react";
import { Bot, Send, X, Menu } from "lucide-react";
import { fitTextarea, useScrollToBottom } from "@/components/chat/chat-hooks";
import { useChatStore } from "@/stores/chat-store";
import { useActiveRun } from "@/stores/run-store";
import { ChatSidebar } from "./chat-sidebar";
import { ChatWelcome, MessageList, NoConversation } from "./message-list";

export function AIChatView() {
  const {
    config, conversations, activeId, messages, streaming, sending, thinkingStep,
    send, cancel, createConversation, selectConversation, loadConfig,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setChatSidebarOpen(false), []);
  const { runs } = useActiveRun();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useScrollToBottom(scrollRef, [messages, streaming, thinkingStep]);

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
    fitTextarea(e.target, 160);
  };

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const showMessages = messages.length > 0 || streaming !== null;
  const statusLine = activeConv?.run_id && activeConv.run_name
    ? `Run “${activeConv.run_name}”`
    : config?.configured
      ? `${config.provider} · ${config.model}`
      : "ตั้งค่า LLM ก่อนใช้งาน";

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-ground">
      {chatSidebarOpen && (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setChatSidebarOpen(false)}
          aria-label="ปิดรายการสนทนา"
        />
      )}
      <ChatSidebar runs={runs} mobileOpen={chatSidebarOpen} onClose={closeSidebar} />

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
              <ChatWelcome onPrompt={(p) => handleSend(p)} runName={activeConv?.run_name ?? null} />
            ) : (
              <MessageList messages={messages} streaming={streaming} thinkingStep={thinkingStep} sending={sending} />
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
