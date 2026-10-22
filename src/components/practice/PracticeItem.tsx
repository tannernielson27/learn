"use client";

import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import type { PracticeAnswered, PracticeItemEntry } from "@/lib/practice/entries";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal } from "@/lib/ngn/submit";

export interface PracticeItemProps {
  entry: PracticeItemEntry;
  done: PracticeAnswered | undefined;
  draft: AnyResponse | undefined;
  onDraft: (response: AnyResponse) => void;
  check: (response: AnyResponse) => Promise<ScoreReveal>;
}

/** The player for one standalone item: open for an answer, or in feedback with what came back. */
function Player({ entry, done, draft, onDraft, check }: PracticeItemProps) {
  if (done?.kind === "scored") {
    return (
      <ItemPlayer
        item={entry.item}
        initialResponse={done.response}
        initialReveal={done.reveal}
        submit={check}
      />
    );
  }
  if (done?.kind === "key") {
    return <ItemPlayer item={entry.item} initialKey={done.key} submit={check} />;
  }
  return (
    <ItemPlayer
      item={entry.item}
      initialResponse={draft}
      onResponseChange={onDraft}
      submit={check}
    />
  );
}

/**
 * One standalone practice item. In a run of missed questions a case study's step plays on its
 * own, with the patient record as it stood at that step beside it and a line naming the step.
 */
export function PracticeItem(props: PracticeItemProps) {
  const { entry } = props;
  if (!entry.record) return <Player {...props} />;
  return (
    <RecordLayout record={entry.record}>
      {entry.context ? <p className="eyebrow mb-3">{entry.context}</p> : null}
      <Player {...props} />
    </RecordLayout>
  );
}
