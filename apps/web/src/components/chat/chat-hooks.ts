"use client";
/** Behaviour shared by the AI chat page and the floating chat widget. */
import { type DependencyList, type RefObject, useEffect } from "react";

/** Keep a scroll container pinned to its newest message whenever `deps` change. */
export function useScrollToBottom(ref: RefObject<HTMLElement | null>, deps: DependencyList) {
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, deps);
}

/** Grow a textarea with its content, up to `maxHeight` px. */
export function fitTextarea(el: HTMLTextAreaElement, maxHeight: number) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
}
