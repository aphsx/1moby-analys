"use client";

import { type PredictionOutput } from "@moby/types";
import type { MouseEvent } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { BUTTON } from "@/components/ui";
import { isCustomerAiGenerated, isCustomerAiGenerating } from "./customer-ai";

type GenAiButtonProps = {
  ai: Pick<PredictionOutput, "ai_status" | "ai_explanation">;
  inFlight: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function GenAiButton({ ai, inFlight, disabled = false, onClick }: GenAiButtonProps) {
  const generating = isCustomerAiGenerating(ai, inFlight);
  const generated = isCustomerAiGenerated(ai);

  return (
    <button
      type="button"
      disabled={disabled || generating}
      onClick={onClick}
      className={`${BUTTON.ghost} text-small`}
    >
      {generating ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden className="text-accent" />}
      {generating ? "กำลังสรุป…" : generated ? "สรุปใหม่" : "สรุป AI"}
    </button>
  );
}
