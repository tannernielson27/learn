"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Icon } from "@/components/ui/Icon";
import { keyResponse } from "@/lib/ngn/presentation";
import type { Item } from "@/lib/ngn/schemas";
import { toKeylessItem, type SubmitHandler } from "@/lib/ngn/submit";
import { notCorrect, type NotCorrectGroup } from "./stageKey";

/** The wall is never answered. */
const refuse: SubmitHandler = async () => {
  throw new Error("The projector view is not answered.");
};

/**
 * The question with its answer key on the projector, for every item type (feat/stage-answer-key):
 * the same renderer every phone draws, answered with the key itself (`keyResponse`, as the AI
 * import's key preview does, #467), so each keyed element reads Correct with its check and rule,
 * and a bowtie's slots, a drop-down's blanks and a drag-and-drop's blanks are filled with the
 * right choices. Every other choice stays readable and unmarked beside them. A layout that draws
 * only what fills its slots once answered lists the choices it leaves out under "Not correct"
 * (`notCorrect`), so the teacher can say why each is wrong.
 *
 * Drawn at app sizes and scaled to the wall by `StageFit`. Read-only and `inert`: nothing in it
 * takes focus or a click, so Space and the right arrow still reach the stage's own keys. The
 * rationale is left to the stage, which clamps it under this view; the sample tag is left off.
 *
 * Only ever handed an item through `stageKey`, which opens once the answer is showing.
 */
export function StageKey({ item }: { item: Item }) {
  const groups = notCorrect(item).filter((group) => group.options.length > 0);
  return (
    <div data-testid="stage-key" inert className="flex flex-col gap-6 text-ink-1">
      <ItemPlayer
        key={item.id}
        item={{ ...toKeylessItem(item), tags: [] }}
        initialKey={{ answerKey: item.answerKey, rationale: {}, scoring: item.scoring }}
        initialResponse={keyResponse(item)}
        submit={refuse}
        showSubmit={false}
        label="Answer key"
      />
      {groups.length === 0 ? null : (
        <NotCorrect groups={groups} columns={item.type === "bowtie" ? 3 : 1} />
      )}
    </div>
  );
}

/** The choices the key leaves out, each with an x and the words "Not correct" for a reader. */
function NotCorrect({ groups, columns }: { groups: NotCorrectGroup[]; columns: 1 | 3 }) {
  const heading = useId();
  return (
    <section data-testid="stage-not-correct" aria-labelledby={heading}>
      <h3 id={heading} className="eyebrow">
        Not correct
      </h3>
      <div
        className={`mt-3 grid gap-x-12 gap-y-4 ${columns === 3 ? "grid-cols-3" : "grid-cols-1"}`}
      >
        {groups.map((group, index) => (
          <div key={group.label ?? index} className="flex min-w-0 flex-col gap-2">
            {group.label === null ? null : (
              <p className="text-sm font-semibold text-ink-2">{group.label}</p>
            )}
            <ul
              className={`flex gap-2 ${columns === 3 ? "flex-col" : "flex-wrap"}`}
              aria-label={group.label === null ? "Not correct" : `Not correct: ${group.label}`}
            >
              {group.options.map((option) => (
                <li
                  key={option}
                  className="flex items-start gap-2 rounded-sm border border-line px-3 py-2 leading-snug text-ink-2"
                >
                  <Icon icon={X} className="mt-0.5 text-incorrect" />
                  <span className="sr-only">Not correct: </span>
                  {option}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
