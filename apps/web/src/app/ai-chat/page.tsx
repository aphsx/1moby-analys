import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { AIChatView } from "@/features/ai-chat/ai-chat-view";

export const metadata: Metadata = { title: pageTitle("/ai-chat") };

export default function AIChatPage() {
  return <AIChatView />;
}
