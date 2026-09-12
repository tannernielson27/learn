"use client";

import { useEffect, useRef, useState } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { FlagToggle } from "@/components/review/FlagToggle";
import { ReviewList } from "@/components/review/ReviewList";
import { Button } from "@/components/ui/Button";
import { scoreItem } from "@/lib/ngn/scoring";
import type { AnyResponse, CaseStudy, Item } from "@/lib/ngn/schemas";
import { CJMM_STEP_LABELS, type CjmmStep, type ScoreResult } from "@/lib/ngn/types";
import { CaseStudySummary } from "./CaseStudySummary";
import { StepIndicator } from "./StepIndicator";

interface StepState {
  /** What the student has chosen so far, submitted or not. */
  response?: AnyResponse;
  /** Present once the step has been submitted. */
  result?: ScoreResult;
  /** Marked to come back to. Independent of whether it has been answered. */
  flagged?: boolean;
}

export interface CaseStudyPlayerProps {
  caseStudy: CaseStudy;
  /**
   * Scores a response. Defaults to local scoring, which is only acceptable in the gallery;
   * sessions and assignments pass a server-backed function instead.
   */
  score?: (item: Item, response: AnyResponse) => ScoreResult;
  onFinished?: (results: ScoreResult[]) => void;
}

/**
 * Six items, one per clinical judgment step, with the patient's record beside them throughout.
 *
 * Each step is an ordinary `ItemPlayer`, so every format works inside a case study unchanged and
 * the answer key still reaches no renderer before that step's own feedback. Only one step is
 * mounted at a time — a student should not be able to read ahead — so what they have chosen is
 * held here and handed back when they return to it, submitted or not.
 */
export function CaseStudyPlayer({
  caseStudy,
  score = scoreItem,
  onFinished,
}: CaseStudyPlayerProps) {
  const total = caseStudy.items.length;
  // 0 to total - 1 while working; `total` once the student has reached the results.
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<StepState[]>(() => caseStudy.items.map(() => ({})));
  const [finished, setFinished] = useState(false);
  const [playing, setPlaying] = useState(caseStudy.id);
  const [reviewing, setReviewing] = useState(false);
  const step = useRef<HTMLDivElement>(null);
  // Set when a jump is made, so focus lands on the step once it has been rendered.
  const follow = useRef(false);

  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    step.current?.focus();
  }, [index]);

  // A different case study is a different attempt, whether or not the caller remembered to
  // remount us. Adjusting during render beats an effect: no first paint of the old one's state.
  if (caseStudy.id !== playing) {
    setPlaying(caseStudy.id);
    setIndex(0);
    setSteps(caseStudy.items.map(() => ({})));
    setFinished(false);
    setReviewing(false);
  }

  const onResults = index >= total;
  const item = caseStudy.items[index];
  const current = steps[index];
  const isLastStep = index === total - 1;

  const update = (at: number, change: StepState) =>
    setSteps((prev) => prev.map((step, i) => (i === at ? { ...step, ...change } : step)));

  const advance = () => {
    const next = index + 1;
    setIndex(next);
    // Reading the last step again and coming forward is not a second attempt, and onFinished is
    // where a session would write a score down.
    if (next >= total && !finished) {
      setFinished(true);
      onFinished?.(steps.map((step) => step.result).filter((r): r is ScoreResult => Boolean(r)));
    }
  };

  const entries = caseStudy.items.map((_item, i) => ({
    id: String(i),
    label: `Step ${i + 1}: ${CJMM_STEP_LABELS[(i + 1) as CjmmStep]}`,
    answered: Boolean(steps[i]?.result),
    flagged: Boolean(steps[i]?.flagged),
  }));

  const jumpTo = (id: string) => {
    follow.current = true;
    setReviewing(false);
    setIndex(Number(id));
  };

  return (
    <RecordLayout record={caseStudy.ehr}>
      <div>
        <header className="mb-6">
          <StepIndicator step={index + 1} total={total} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {index > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            ) : null}
            {!onResults ? (
              <FlagToggle
                flagged={Boolean(current?.flagged)}
                label={`step ${index + 1}`}
                onChange={(flagged) => update(index, { flagged })}
              />
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              aria-expanded={reviewing}
              onClick={() => setReviewing((open) => !open)}
            >
              Review
            </Button>
          </div>
        </header>

        {/* Keyed on the step, so each one crossfades and slides in (docs/04 §5). */}
        <div
          key={index}
          ref={step}
          tabIndex={-1}
          role="group"
          aria-label={
            onResults
              ? "Results"
              : `Step ${index + 1} of ${total}: ${CJMM_STEP_LABELS[(index + 1) as CjmmStep]}`
          }
          className="animate-[fade-up_var(--duration-base)_var(--ease-out-expo)_both] focus:outline-none"
        >
          {reviewing ? (
            <ReviewList
              label="Review this case study"
              entries={entries}
              currentId={String(index)}
              onJump={jumpTo}
            />
          ) : onResults ? (
            <CaseStudySummary
              results={steps.map((step) => step.result).filter((r): r is ScoreResult => Boolean(r))}
            />
          ) : item ? (
            <ItemPlayer
              key={item.id}
              item={item}
              score={score}
              initialResponse={current?.response}
              initialResult={current?.result}
              onResponseChange={(response) => update(index, { response })}
              onSubmitted={(response, result) => update(index, { response, result })}
            />
          ) : null}
        </div>
      </div>

      {/* Takes the place of the shell's submit bar, which is gone once the step has been answered. */}
      {!onResults && !reviewing && current?.result ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-1/95 px-5 py-3 backdrop-blur-sm [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl items-center justify-end">
            <Button variant="primary" onClick={advance}>
              {isLastStep ? "See results" : "Next step"}
            </Button>
          </div>
        </div>
      ) : null}
    </RecordLayout>
  );
}
