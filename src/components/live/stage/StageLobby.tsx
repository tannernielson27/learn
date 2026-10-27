import type { ReactNode } from "react";
import { formatSessionCode } from "@/lib/live/sessionCode";
import { StageNumber } from "./StageParts";

export interface StageLobbyProps {
  title: string;
  code: string;
  /** "learn-nclex.app/join". */
  url: string;
  /** The join panel drawn on the server: `JoinCode` at stage size, with its QR code. */
  join?: ReactNode;
  names: readonly string[];
}

/**
 * The lobby on the projector (LobbyStage mockup): the code and where to type it first, the QR
 * code second, then the count and the names. Names show here and nowhere else on the stage
 * (owner decision 4). The list is clipped rather than scrolled, because nobody scrolls a wall.
 */
export function StageLobby({ title, code, url, join, names }: StageLobbyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-[4.4cqb]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-[3cqb]">
        <h1 className="font-read text-stage-option leading-tight">{title}</h1>
      </div>
      {join ?? (
        <section aria-label="Join code" className="flex flex-col gap-[2.6cqb]">
          <p className="text-stage-option font-medium">
            Go to <span className="font-mono font-bold">{url}</span> and type
          </p>
          <p
            data-testid="join-code"
            className="font-mono text-stage-code leading-none font-semibold tracking-[0.08em]"
          >
            {formatSessionCode(code)}
          </p>
        </section>
      )}
      <hr className="border-t-(length:--stage-stroke) border-stage-line" />
      <section aria-label="In this session" className="flex min-h-0 flex-col gap-[2.6cqb]">
        <StageNumber value={names.length} words="in this session" />
        <ul className="flex max-h-[21cqb] min-h-0 flex-wrap gap-x-[1.5cqb] gap-y-[1.3cqb] overflow-hidden">
          {names.map((name, index) => (
            <li
              // Two people may share a name; the order they joined in is theirs alone.
              key={`${index}:${name}`}
              className="motion-enter rounded-full bg-surface-2 px-[2cqb] py-[0.9cqb] text-stage-label font-medium"
            >
              {name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
