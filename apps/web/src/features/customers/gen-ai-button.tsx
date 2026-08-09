"use client";

import { Loader2, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";
import type { PredictionOutput } from "@/lib/ml-api";
import { isCustomerAiGenerated, isCustomerAiGenerating } from "./customer-ai";

type GenAiButtonProps = {
  ai: Pick<PredictionOutput, "ai_status" | "ai_explanation">;
  inFlight: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function GenAiButton({
  ai,
  inFlight,
  disabled = false,
  onClick,
}: GenAiButtonProps) {
  const generating = isCustomerAiGenerating(ai, inFlight);
  const generated = isCustomerAiGenerated(ai);

  return (
    <button
      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[color:var(--moby-600)] px-3.5 font-semibold text-[12px] text-white transition-colors hover:bg-[color:var(--moby-800)] disabled:cursor-not-allowed disabled:opacity-70"
      disabled={disabled || generating}
      onClick={onClick}
      type="button"
    >
      {generating ? (
        <Loader2 className="animate-spin" size={13} />
      ) : (
        <Sparkles size={13} />
      )}
      {generating ? "Generating" : generated ? "Generated" : "Gen AI"}
    </button>
  );
}
