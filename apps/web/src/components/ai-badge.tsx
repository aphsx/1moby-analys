export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-[color:var(--moby-600)] to-[color:var(--moby-800)] px-2 py-0.5 font-bold text-[10px] text-white tracking-wide ${className ?? ""}`}
    >
      AI
    </span>
  );
}
