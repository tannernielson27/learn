"use client";

import { Component, useSyncExternalStore, type ReactNode } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { caseSteps } from "@/lib/authoring/aiImportCaseStudy";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { keyResponse } from "@/lib/ngn/presentation";
import { ehrRecordSchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem, type Reveal, type SubmitHandler } from "@/lib/ngn/submit";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { EhrPreview } from "./EhrPreview";

/**
 * A staged question as students will see it, with its key shown (#346): the real players, read
 * only. A valid item opens on its key, answered with the key itself (#467), so each keyed element
 * reads Correct. Opening on `initialKey` alone, as a live phone that did not answer does, marked
 * them all Missed, which a teacher read as the AI getting the answer wrong. An item with no key
 * yet is shown as a student would answer it, with no key.
 * Anything else cannot be drawn until it is fixed (#347). This is a teacher's own workspace's
 * key, on an author route (ADR 0003): nothing here is sent to a student.
 *
 * A case study is drawn step by step (#593), so one step with no key no longer hides the other
 * five: each step that is whole opens on its key, and one that is not says "No key yet".
 */

const refuse: SubmitHandler = async () => {
  throw new Error("A preview is not answered.");
};

const keyOf = (item: Item): Reveal => ({
  answerKey: item.answerKey,
  rationale: item.rationale,
  scoring: item.scoring,
});

function KeyedItem({ item, label }: { item: Item; label: string }) {
  return (
    <ItemPlayer
      item={toKeylessItem(item)}
      initialKey={keyOf(item)}
      initialResponse={keyResponse(item)}
      submit={refuse}
      showSubmit={false}
      label={label}
      // A review lists many keyed questions, and each rationale is a landmark: named apart.
      rationaleLabel={`Rationale, ${label}`}
    />
  );
}

/** An item with no key yet still has its type, stem and content: enough for the player. */
const drawable = (item: unknown): boolean => {
  if (typeof item !== "object" || item === null) return false;
  const value = item as { type?: unknown; stem?: unknown; content?: unknown };
  return (
    typeof value.type === "string" &&
    typeof value.stem === "object" &&
    value.stem !== null &&
    typeof value.content === "object" &&
    value.content !== null
  );
};

export interface AiImportEntryPreviewProps {
  kind: "item" | "case_study";
  item: unknown;
  /** Names the question region, e.g. "Question 3, preview". */
  label: string;
}

export function AiImportEntryPreview({ kind, item, label }: AiImportEntryPreviewProps) {
  if (item === null || item === undefined) {
    return <p className="text-sm text-ink-2">Can&apos;t preview yet.</p>;
  }

  if (kind === "case_study") {
    const steps = caseSteps(item);
    if (!steps) return <p className="text-sm text-ink-2">Can&apos;t preview yet.</p>;
    // The record is drawn only when it is whole; a step is still shown without it.
    const record = ehrRecordSchema.safeParse((item as { ehr?: unknown }).ehr);
    return (
      <div className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const number = (index + 1) as CjmmStep;
          const keyed = itemSchema.safeParse(step).success;
          return (
            <details key={number} className="rounded-sm border border-line bg-surface-1">
              <summary className="tap-target cursor-pointer px-3 py-2 text-sm font-medium text-ink-1">
                Step {number} of 6: {CJMM_STEP_LABELS[number]}
                {keyed ? null : <span className="font-normal text-ink-2"> · No key yet</span>}
              </summary>
              <div className="flex flex-col gap-4 border-t border-line p-3">
                {record.success ? <EhrPreview record={recordAtStep(record.data, number)} /> : null}
                <QuestionPreview item={step} label={`${label}, step ${number}`} />
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  return <QuestionPreview item={item} label={label} />;
}

/** One question: on its key when it is whole, as a student would answer it when it has none. */
function QuestionPreview({ item, label }: { item: unknown; label: string }) {
  const parsed = itemSchema.safeParse(item);
  if (parsed.success) return <KeyedItem item={parsed.data} label={label} />;
  if (!drawable(item)) {
    return <p className="text-sm text-ink-2">Can&apos;t preview yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2">No key yet.</p>
      <UnkeyedItem item={item as Record<string, unknown>} label={label} />
    </div>
  );
}

const CANNOT_DRAW = <p className="text-sm text-ink-2">Can&apos;t preview yet.</p>;

const noSubscription = () => () => {};

/**
 * An item that is not valid yet (its key is empty) may still trip the player, which expects a
 * whole item. It is drawn in the browser only, never on the server, so a question that cannot be
 * drawn never takes the page down with it, and a boundary turns a throw into a sentence.
 */
function UnkeyedItem({ item, label }: { item: Record<string, unknown>; label: string }) {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!inBrowser) return null;
  return (
    <PreviewBoundary>
      <ItemPlayer
        item={{ tags: [], ...item } as unknown as Item}
        submit={refuse}
        showSubmit={false}
        label={label}
      />
    </PreviewBoundary>
  );
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? CANNOT_DRAW : this.props.children;
  }
}
