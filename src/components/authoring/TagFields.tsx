"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { stepTagLabel } from "@/lib/authoring/tagFilter";
import {
  CLIENT_NEEDS,
  normalizeTags,
  splitTags,
  TAG_LIMITS,
  tagLimitProblem,
  type ClientNeed,
} from "@/lib/ngn/tags";
import type { CjmmStep } from "@/lib/ngn/types";

export interface TagFieldsProps {
  /** Prefix for element ids, unique on the page. */
  idPrefix: string;
  tags: readonly string[];
  cjmmStep: CjmmStep | undefined;
  onTagsChange: (tags: string[]) => void;
  /** Without it the step is fixed (a case study step takes it from its place) and only shown. */
  onStepChange?: (step: CjmmStep | undefined) => void;
  /** Inside a case study the step's own heading is the h2 above this. */
  headingLevel?: "h2" | "h3";
}

const STEPS = [1, 2, 3, 4, 5, 6] as const;

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";
const chipClass =
  "inline-flex items-center rounded-sm border border-line bg-surface-1 text-sm text-ink-1";

/**
 * An item's tags: its clinical judgment step, the fixed client needs categories, and free topic
 * tags. Every change is normalized and checked against the limits before it reaches the form.
 */
export function TagFields({
  idPrefix,
  tags,
  cjmmStep,
  onTagsChange,
  onStepChange,
  headingLevel = "h2",
}: TagFieldsProps) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { clientNeeds, topics } = splitTags(tags);
  const Heading = headingLevel;
  const ids = {
    heading: `${idPrefix}-tags-heading`,
    step: `${idPrefix}-tags-step`,
    topic: `${idPrefix}-tags-topic`,
    hint: `${idPrefix}-tags-hint`,
    problem: `${idPrefix}-tags-problem`,
  };

  /** Applies a change only when it stays within the limits; otherwise says why. */
  function commit(next: readonly string[]): boolean {
    const normalized = normalizeTags(next);
    const reason = tagLimitProblem(normalized);
    setProblem(reason);
    if (reason) return false;
    onTagsChange(normalized);
    return true;
  }

  function addTyped() {
    const typed = draft.split(",").filter((part) => part.trim() !== "");
    if (typed.length === 0) return;
    if (commit([...tags, ...typed])) setDraft("");
  }

  function toggleNeed(need: ClientNeed, on: boolean) {
    commit(on ? [...tags, need] : tags.filter((tag) => tag !== need));
  }

  function removeTopic(topic: string) {
    commit(tags.filter((tag) => tag !== topic));
    // The button goes away with its tag, so focus returns to where tags are typed.
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // Enter adds the tag instead of submitting the editor's form.
    event.preventDefault();
    addTyped();
  }

  return (
    <section
      aria-labelledby={ids.heading}
      className="flex flex-col gap-4 border-t border-line pt-6"
    >
      <Heading id={ids.heading} className="text-sm font-medium text-ink-1">
        Tags
      </Heading>

      {onStepChange ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.step} className="text-sm font-medium text-ink-1">
            Clinical judgment step
          </label>
          <select
            id={ids.step}
            className={`tap-target ${fieldClass}`}
            value={cjmmStep ?? ""}
            onChange={(event) =>
              onStepChange(
                event.target.value === "" ? undefined : (Number(event.target.value) as CjmmStep),
              )
            }
          >
            <option value="">None</option>
            {STEPS.map((step) => (
              <option key={step} value={step}>
                {stepTagLabel(step)}
              </option>
            ))}
          </select>
        </div>
      ) : cjmmStep ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink-1">Clinical judgment step</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <span className={`${chipClass} px-2 py-1`}>{stepTagLabel(cjmmStep)}</span>
            Set by its place in the case study.
          </p>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-1">Client needs</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {CLIENT_NEEDS.map((need, index) => (
            <label
              key={need}
              htmlFor={`${idPrefix}-need-${index}`}
              className="tap-target flex items-center gap-3 text-sm text-ink-1"
            >
              <input
                id={`${idPrefix}-need-${index}`}
                type="checkbox"
                className="size-5 shrink-0 accent-accent"
                checked={clientNeeds.includes(need)}
                onChange={(event) => toggleNeed(need, event.target.checked)}
              />
              {need}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.topic} className="text-sm font-medium text-ink-1">
          Add topic tags
        </label>
        <p id={ids.hint} className="text-sm text-ink-2">
          Separate several with commas. Up to {TAG_LIMITS.count} tags in all, each up to{" "}
          {TAG_LIMITS.length} characters.
        </p>
        <div className="flex gap-2">
          <input
            ref={input}
            id={ids.topic}
            type="text"
            className={`tap-target ${fieldClass}`}
            value={draft}
            maxLength={TAG_LIMITS.length * TAG_LIMITS.count}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${ids.problem} ${ids.hint}` : ids.hint}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button type="button" onClick={addTyped}>
            Add
          </Button>
        </div>
        {problem ? (
          <p id={ids.problem} role="alert" className="text-sm text-incorrect">
            {problem}
          </p>
        ) : null}
        {topics.length > 0 ? (
          <ul aria-label="Topic tags" className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li key={topic} className={`${chipClass} pl-2`}>
                {topic}
                <button
                  type="button"
                  aria-label={`Remove tag ${topic}`}
                  onClick={() => removeTopic(topic)}
                  className="tap-target inline-flex items-center justify-center px-2 text-ink-2 hover:text-ink-1"
                >
                  <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3">
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
