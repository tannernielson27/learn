import { ItemPlayer } from "@/components/question/ItemPlayer";
import { toScoreReveal, type ItemReveal, type ParticipantItem } from "@/lib/live/transport";
import type { AnsweredPayload } from "@/lib/liveSupabase/wire";
import type { SubmitHandler } from "@/lib/ngn/submit";

const NOT_ANSWERED = "You did not answer this question.";

/**
 * The scoring rule on a live reveal, said in one line: the class is mid-discussion, and the
 * practice player's paragraph is too much to read on a phone held up in a lecture hall. Practice
 * and assignments keep the full explanation.
 */
const LIVE_SCORING = { plus_minus: "Each wrong choice takes a point away." } as const;

/**
 * The item once the host has revealed it: the same renderer again, in feedback mode.
 *
 * A phone that answered sees its own answer marked against the key. A phone that did **not**
 * (#181) is handed the same key — the server sends every participant the reveal, with `score`
 * null for one that stayed quiet — and sees it on the same renderer through `initialKey`: nothing
 * chosen, the key's elements marked, the rationale beneath, and a line saying they did not answer,
 * so the class discussion has something on every phone to follow.
 *
 * A reveal with marks but no answer this phone can draw (a stored answer that no longer parses)
 * falls to the key-only view too, without the note: they did answer, it just cannot be shown.
 */
export function RevealedItem({
  item,
  answered,
  revealed,
  progress,
}: {
  item: ParticipantItem;
  answered: AnsweredPayload | null;
  revealed: ItemReveal;
  progress?: { index: number; total: number };
}) {
  const mine = toScoreReveal(revealed);

  if (mine === null || answered === null || answered.itemId !== item.id) {
    return (
      <div className="mt-6">
        {revealed.score === null ? (
          <p
            data-testid="not-answered"
            className="measure motion-settle mb-4 text-sm text-ink-2 motion-reduce:animate-none"
          >
            {NOT_ANSWERED}
          </p>
        ) : null}
        <ItemPlayer
          key={`${item.id}:key`}
          item={item}
          initialKey={revealed.reveal}
          progress={progress}
          submit={refuseSecondAnswer}
          label="Answer key"
        />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <ItemPlayer
        key={`${item.id}:reveal`}
        item={item}
        initialResponse={answered.response}
        initialReveal={mine}
        progress={progress}
        submit={refuseSecondAnswer}
        scoringExplanations={LIVE_SCORING}
        label="Your answer"
      />
    </div>
  );
}

/** A player opened on an answer already given has nothing to send. */
export const refuseSecondAnswer: SubmitHandler = async () => {
  throw new Error("This question has already been answered.");
};
