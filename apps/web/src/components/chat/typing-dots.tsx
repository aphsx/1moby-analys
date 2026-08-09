/** Three bouncing dots shown while the assistant is replying. */
export function TypingDots() {
  return (
    <>
      {[0, 150, 300].map((delay) => (
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--moby-500)]"
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </>
  );
}
