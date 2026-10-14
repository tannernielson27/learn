export interface StaysBehindListProps {
  /** From `staysBehind`: one line each for what keeps what it was given. */
  lines: readonly string[];
}

/** Lucide's history, at the design direction's 20px and 1.75 stroke. Decoration only. */
function KeptIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-ink-2"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/** The confirm step's list of what a move leaves with the quiz in hand (#417). */
export function StaysBehindList({ lines }: StaysBehindListProps) {
  return (
    <ul aria-label="What stays with this quiz" className="flex flex-col gap-2">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2 text-ink-1">
          <KeptIcon />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
