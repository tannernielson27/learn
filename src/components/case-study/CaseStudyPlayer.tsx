"use client";

import { useEffect, useRef, useState } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { FlagToggle } from "@/components/review/FlagToggle";
import { ReviewList } from "@/components/review/ReviewList";
import { Button } from "@/components/ui/Button";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type {
  PlayableCaseStudy,
  PlayableItem,
  Reveal,
  ScoreReveal,
  SubmitHandlerFor,
} from "@/lib/ngn/submit";
import { CJMM_STEP_LABELS, type CjmmStep, type ScoreResult } from "@/lib/ngn/types";
import { CaseStudySummary } from "./CaseStudySummary";
import { StepIndicator } from "./StepIndicator";

interface StepState {
  /** What the student has chosen so far, submitted or not. */
  response?: AnyResponse;
  /**
   * What the handler sent back for this step: its score and, with it, its key. Present once the
   * step has been submitted, and held so reopening the step can mark the answer again — a keyless
   * step has no key of its own to mark it against (#46).
   */
  reveal?: ScoreReveal;
  /**
   * A step answered before, whose answer can no longer be marked: its key with no score, opened
   * read-only (`ItemPlayer`'s `initialKey`). Only a practice run reopened on a reload sets it.
   */
  keyOnly?: Reveal;
  /** Marked to come back to. Independent of whether it has been answered. */
  flagged?: boolean;
}

/** What a step reopens with: a practice run reloaded (#241) hands back the steps it has answered. */
export interface InitialStep {
  response?: AnyResponse;
  reveal?: ScoreReveal;
  keyOnly?: Reveal;
}

const isAnswered = (step: StepState | undefined): boolean => Boolean(step?.reveal ?? step?.keyOnly);

export interface CaseStudyPlayerProps<T extends PlayableItem> {
  /**
   * The case study to play. Normally keyless: a student's browser is sent `content` only, and each
   * step's key arrives with that step's own score (ADR 0003, #46). The gallery and the authoring
   * preview pass a parsed `CaseStudy`, because the handler they pass scores it in this browser.
   */
  caseStudy: PlayableCaseStudy<T>;
  /**
   * Builds the submit handler for a step, since each step is its own item (#56). Sessions and
   * assignments pass one that goes to the server; the gallery and the authoring preview pass
   * `scoreInProcess`, which is why only they may pass a case study that still has its keys.
   */
  submitFor: SubmitHandlerFor<T>;
  onFinished?: (results: ScoreResult[]) => void;
  /**
   * Steps already answered, by position, read once at mount (#241): a practice run's case study
   * reopens on a reload with each answered step's own marks and key, and nothing for the rest.
   */
  initialSteps?: readonly (InitialStep | undefined)[];
}

/**
 * Six items, one per clinical judgment step, with the patient's record beside them throughout.
 *
 * Each step is an ordinary `ItemPlayer`, so every format works inside a case study unchanged and
 * the answer key still reaches no renderer before that step's own feedback. Only one step is
 * mounted at a time — a student should not be able to read ahead — so what they have chosen is
 * held here and handed back when they return to it, submitted or not.
 */
export function CaseStudyPlayer<T extends PlayableItem>({
  caseStudy,
  submitFor,
  onFinished,
  initialSteps,
}: CaseStudyPlayerProps<T>) {
  const total = caseStudy.items.length;
  // 0 to total - 1 while working; `total` once the student has reached the results.
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<StepState[]>(() =>
    caseStudy.items.map((_item, i) => ({ ...initialSteps?.[i] })),
  );
  const [finished, setFinished] = useState(false);
  const [playing, setPlaying] = useState(caseStudy.id);
  const [reviewing, setReviewing] = useState(false);
  const step = useRef<HTMLDivElement>(null);
  // Set by every move the student makes, so focus lands on the step once it has been rendered.
  // Never set on first render: opening the case study must not take focus from the page.
  const follow = useRef(false);

  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    step.current?.focus();
  }, [index, reviewing]);

  // Back, Next step, Results and the review rows all remove or hide the control that was pressed.
  const goTo = (to: number) => {
    follow.current = true;
    setReviewing(false);
    setIndex(to);
  };

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
    goTo(next);
    // Reading the last step again and coming forward is not a second attempt, and onFinished is
    // where a session would write a score down.
    if (next >= total && !finished) {
      setFinished(true);
      onFinished?.(
        steps.map((step) => step.reveal?.score).filter((r): r is ScoreResult => Boolean(r)),
      );
    }
  };

  const entries = caseStudy.items.map((_item, i) => ({
    id: String(i),
    label: `Step ${i + 1}: ${CJMM_STEP_LABELS[(i + 1) as CjmmStep]}`,
    answered: isAnswered(steps[i]),
    flagged: Boolean(steps[i]?.flagged),
  }));

  // Picking the step already open changes no index, but closing the list still runs the effect.
  const jumpTo = (id: string) => goTo(Number(id));

  return (
    <RecordLayout record={caseStudy.ehr}>
      <div>
        <header className="mb-6">
          <StepIndicator step={index + 1} total={total} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {index > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => goTo(index - 1)}>
                Back
              </Button>
            ) : null}
            {finished && !onResults ? (
              <Button size="sm" variant="ghost" onClick={() => goTo(total)}>
                Results
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
            reviewing
              ? undefined
              : onResults
                ? "Results"
                : `Step ${index + 1} of ${total}: ${CJMM_STEP_LABELS[(index + 1) as CjmmStep]}`
          }
          className="animate-[fade-up_var(--duration-base)_var(--ease-out-expo)_both]"
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
              results={steps
                .map((step) => step.reveal?.score)
                .filter((r): r is ScoreResult => Boolean(r))}
            />
          ) : item ? (
            <ItemPlayer
              key={item.id}
              item={item}
              submit={submitFor(item)}
              initialResponse={current?.response}
              initialReveal={current?.reveal}
              initialKey={current?.keyOnly}
              onResponseChange={(response) => update(index, { response })}
              onSubmitted={(response, checked) => update(index, { response, reveal: checked })}
            />
          ) : null}
        </div>
      </div>

      {/* Takes the place of the shell's submit bar, which is gone once the step has been answered. */}
      {!onResults && !reviewing && isAnswered(current) ? (
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
