/** Three bouncing dots shown while the assistant is replying (feedback, so motion is fine). taste-skill-ignore */
export function TypingDots() {
  return (
    <>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-accent motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </>
  );
}
