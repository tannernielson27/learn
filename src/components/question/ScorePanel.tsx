"use client";

import { Check, X } from "lucide-react";
import { useId, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { SCORING_MODEL_LABELS } from "@/lib/ngn/labels";
import type { RichText } from "@/lib/ngn/schemas";
import type { ScoreResult } from "@/lib/ngn/types";
import { RichTextView } from "./RichTextView";
import { scoreVerdict, type VerdictKind } from "./verdict";

/** The panel's left rule, as an option's (docs/04 §4): green for full marks, red for none. */
const VERDICT_RULE: Record<VerdictKind, string> = {
  full: "border-l-4 border-l-correct",
  partial: "border-l-4 border-l-ink-1",
  none: "border-l-4 border-l-incorrect",
};

const VERDICT_TEXT: Record<VerdictKind, string> = {
  full: "text-correct",
  partial: "text-ink-1",
  none: "text-incorrect",
};

const PANEL =
  "mt-8 animate-[fade-up_var(--duration-slow)_var(--ease-out-expo)_both] rounded-md border border-line bg-surface-1 p-5";

/** The rationale, in the reading face the patient record uses (PracticePhone mockup). */
function Rationale({ text }: { text: RichText }) {
  return (
    <RichTextView text={text} className="mt-2 font-read text-base leading-relaxed text-ink-1" />
  );
}

/**
 * The verdict on a checked answer (docs/04 §4): the whole answer's word first, with its icon and
 * a matching left rule, then the points in mono, the scoring rule, and the rationale. The words are
 * never the element words, so an option and the item are never both "Correct".
 */
export function ScorePanel({
  panel,
  score,
  note,
  explanation,
  rationale,
}: {
  panel: RefObject<HTMLElement | null>;
  score: ScoreResult;
  note?: string;
  /** The rule in other words (a live phone's one short line); the model's own when left out. */
  explanation?: string;
  rationale?: RichText;
}) {
  const model = SCORING_MODEL_LABELS[score.model];
  const verdict = scoreVerdict(score);
  const verdictId = useId();
  const pointsId = useId();
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="Score"
      aria-describedby={`${verdictId} ${pointsId}`}
      data-verdict={verdict.kind}
      className={`${PANEL} ${VERDICT_RULE[verdict.kind]}`}
    >
      <h2 className="eyebrow">Score</h2>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        {/* Colour is never the only signal: the word leads, and the icon repeats it. */}
        <p
          id={verdictId}
          className={`flex items-center gap-2 text-lg font-bold ${VERDICT_TEXT[verdict.kind]}`}
        >
          {verdict.kind === "partial" ? null : (
            <Icon icon={verdict.kind === "full" ? Check : X} className="size-5" />
          )}
          <span>{verdict.headline}</span>
        </p>
        <p id={pointsId} className="motion-settle tabular font-mono text-2xl font-semibold">
          <span className="sr-only">{verdict.detail}</span>
          <span aria-hidden="true">
            {score.points}
            <span className="text-base font-medium text-ink-2"> / {score.maxPoints}</span>
          </span>
        </p>
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">{model.name}.</span>{" "}
        <span className="text-ink-2">{explanation ?? model.explanation}</span>
      </p>
      {note ? <p className="mt-2 text-sm text-ink-1">{note}</p> : null}
      {rationale ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="eyebrow">Rationale</h3>
          <Rationale text={rationale} />
        </div>
      ) : null}
    </aside>
  );
}

/** The rationale on its own, for a key revealed with no answer to score (#181). */
export function RationalePanel({ rationale }: { rationale: RichText }) {
  const headingId = useId();
  return (
    <aside aria-labelledby={headingId} className={PANEL}>
      <h2 id={headingId} className="eyebrow">
        Rationale
      </h2>
      <Rationale text={rationale} />
    </aside>
  );
}

/**
 * How the score was arrived at, element by element, straight from the engine's breakdown: the
 * player computes none of it. It is its own region rather than part of the score panel, so the
 * total there stays the one number in it.
 */
export function ScoreBreakdown({ score }: { score: ScoreResult }) {
  const headingId = useId();
  if (score.breakdown.length === 0) return null;
  return (
    // Named "Breakdown", not "Score breakdown": Playwright matches accessible names by substring,
    // so the latter would also answer to every query for the score panel beside it.
    <aside
      aria-labelledby={headingId}
      className="mt-4 animate-[fade-up_var(--duration-slow)_var(--ease-out-expo)_both] rounded-md border border-line bg-surface-1 p-5"
    >
      <h2 id={headingId} className="eyebrow">
        Breakdown
      </h2>
      <ul className="mt-2 text-sm">
        {score.breakdown.map((entry) => (
          <li
            key={entry.elementId}
            className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0"
          >
            <span>{entry.label ?? entry.elementId}</span>
            {/* The element itself already says correct or incorrect; this is the arithmetic. */}
            <span className="tabular w-8 shrink-0 text-right font-mono text-ink-2">
              {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
