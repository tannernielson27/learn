import type { Metadata } from "next";
import { StageReveal } from "@/components/live/stage/StageReveal";
import { optionLetter, stageQuestion } from "@/components/live/stage/stageItem";
import { stageKey } from "@/components/live/stage/stageKey";
import type { ResultsChartRow } from "@/components/ui/ResultsChart";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "@/lib/ngn/labels";
import { itemSchema, type Item } from "@/lib/ngn/schemas";

export const metadata: Metadata = { title: "Projector answer key" };

/** A made-up spread of a class's answers, the same on every build. */
const COUNTS = [14, 31, 6, 9, 3, 11];

/** The chart's rows for the two layouts with one bar per option; null for every other. */
function rowsFor(item: Item): ResultsChartRow[] | null {
  if (item.type === "multiple_choice") {
    return item.content.options.map((option, index) => ({
      letter: optionLetter(index),
      label: option.label,
      count: COUNTS[index % COUNTS.length] ?? 0,
      isKey: option.id === item.answerKey.correctOptionId,
    }));
  }
  if (item.type === "multiple_response") {
    return item.content.options.map((option, index) => ({
      label: option.label,
      count: COUNTS[index % COUNTS.length] ?? 0,
      isKey: item.answerKey.correctOptionIds.includes(option.id),
    }));
  }
  return null;
}

/**
 * The answer showing on the projector for every item type, from each type's canonical fixture,
 * each on a 1280×720 stage (the smaller of the two projector sizes it is checked at): the class's
 * chart for multiple choice and select all that apply, and the question answered with its key for
 * every other layout, scaled to the wall. Under `/gallery/live` rather than in the nav, as the
 * podium is: a nav entry restales every visual baseline.
 */
export default function StageRevealGalleryPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Projector answer key</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        What the projector shows when the teacher shows the answer: the right answer marked, and the
        choices that are not correct still readable, for every question format. Each stage is 1280
        by 720 and scrolls sideways on a narrow screen.
      </p>
      <div className="mt-8 space-y-10">
        {ITEM_TYPES.map((type) => {
          const item = itemSchema.parse(FIXTURES[type].canonical) as Item;
          const rows = rowsFor(item);
          const label = ITEM_TYPE_LABELS[type];
          const name = type.replaceAll("_", "-");
          // Shares are out of the answers received: one vote each for multiple choice, so its rows
          // sum to it; select all's rows count choices, so a class of 40 answered.
          const total =
            rows === null
              ? 0
              : type === "multiple_choice"
                ? rows.reduce((sum, row) => sum + row.count, 0)
                : 40;
          return (
            <section key={type} aria-labelledby={`reveal-${name}`} className="space-y-3">
              <h2 id={`reveal-${name}`} className="font-read text-xl text-ink-1">
                {label}
              </h2>
              <div
                // A stage wider than a phone: its own scroll box, reachable from the keyboard.
                tabIndex={0}
                role="region"
                aria-label={`${label}, projector view`}
                className="max-w-full overflow-x-auto rounded-sm border border-line"
              >
                <div
                  data-theme="light"
                  data-stage=""
                  data-testid={`stage-reveal-${name}`}
                  className="relative h-[720px] w-[1280px] overflow-hidden bg-stage-surface text-stage-ink [container-type:size]"
                >
                  <div className="flex h-full flex-col px-(--stage-pad-inline) py-(--stage-pad-block)">
                    <StageReveal
                      place={{
                        position: 3,
                        itemCount: 6,
                        label: "Question 3 of 6",
                        caseStep: null,
                      }}
                      answers={rows === null ? null : { responded: total, present: 80 }}
                      question={stageQuestion(item)}
                      rows={rows}
                      total={total}
                      keyed={stageKey(item, true)}
                      rationale={item.rationale.general ?? null}
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
