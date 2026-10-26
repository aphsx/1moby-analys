export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-accent-soft px-2 py-0.5 text-micro font-medium text-accent-ink ${className ?? ""}`}
    >
      AI
    </span>
  );
}
