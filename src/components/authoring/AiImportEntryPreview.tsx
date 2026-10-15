"use client";

import { ItemPlayer } from "@/components/question/ItemPlayer";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { caseStudySchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem, type Reveal, type SubmitHandler } from "@/lib/ngn/submit";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { EhrPreview } from "./EhrPreview";

/**
 * A staged question as students will see it, with its key shown (#346): the real players, read
 * only. A valid item opens on its key (`initialKey`, as a live session shows it to a phone that
 * did not answer). An item with no key yet is shown as a student would answer it, with no key.
 * Anything else cannot be drawn until it is fixed (#347). This is a teacher's own workspace's
 * key, on an author route (ADR 0003): nothing here is sent to a student.
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
      submit={refuse}
      showSubmit={false}
      label={label}
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
    return (
      <p className="text-sm text-ink-2">
        This question could not be built from the document, so it cannot be shown yet. Its source is
        below.
      </p>
    );
  }

  if (kind === "case_study") {
    const parsed = caseStudySchema.safeParse(item);
    if (!parsed.success) {
      return (
        <p className="text-sm text-ink-2">
          This case study is missing answers, so it cannot be shown step by step yet.
        </p>
      );
    }
    const caseStudy = parsed.data;
    return (
      <div className="flex flex-col gap-3">
        {caseStudy.items.map((step, index) => {
          const number = (index + 1) as CjmmStep;
          return (
            <details key={step.id} className="rounded-sm border border-line bg-surface-1">
              <summary className="tap-target cursor-pointer px-3 py-2 text-sm font-medium text-ink-1">
                Step {number} of 6: {CJMM_STEP_LABELS[number]}
              </summary>
              <div className="flex flex-col gap-4 border-t border-line p-3">
                <EhrPreview record={recordAtStep(caseStudy.ehr, number)} />
                <KeyedItem item={step} label={`${label}, step ${number}`} />
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  const parsed = itemSchema.safeParse(item);
  if (parsed.success) return <KeyedItem item={parsed.data} label={label} />;
  if (!drawable(item)) {
    return (
      <p className="text-sm text-ink-2">
        This question is not complete, so it cannot be shown yet. Its source is below.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2">No key yet. This is how students will see it.</p>
      <ItemPlayer item={item as Item} submit={refuse} showSubmit={false} label={label} />
    </div>
  );
}
