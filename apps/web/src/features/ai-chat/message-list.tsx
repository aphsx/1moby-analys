"use client";
/** Message area of the AI chat page: the messages, the streaming answer, thinking steps and the empty states. */
import { Bot, Plus, Loader2, MessageSquare, User } from "lucide-react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { TypingDots } from "@/components/chat/typing-dots";
import { BUTTON } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { type ChatMsg, type StreamingMsg, type ThinkingStep } from "@/stores/chat-store";
import { EvidencePanel } from "./evidence-panel";

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

export function ChatWelcome({ onPrompt, runName }: { onPrompt: (p: string) => void; runName: string | null }) {
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

export function NoConversation({ onCreate }: { onCreate: () => void }) {
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

export function MessageList({
  messages,
  streaming,
  thinkingStep,
  sending,
}: {
  messages: ChatMsg[];
  streaming: StreamingMsg | null;
  thinkingStep: ThinkingStep | null;
  sending: boolean;
}) {
  return (
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
  );
}
