import { History } from "lucide-react";
import { Icon } from "@/components/ui/Icon";

export interface StaysBehindListProps {
  /** From `staysBehind`: one line each for what keeps what it was given. */
  lines: readonly string[];
}

/** The confirm step's list of what a move leaves with the quiz in hand (#417). */
export function StaysBehindList({ lines }: StaysBehindListProps) {
  return (
    <ul aria-label="What stays with this quiz" className="flex flex-col gap-2">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2 text-ink-1">
          <Icon icon={History} className="mt-0.5 text-ink-2" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
