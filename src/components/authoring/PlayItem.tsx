"use client";

import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { KeylessItem, ScoreReveal } from "@/lib/ngn/submit";

export interface PlayItemProps {
  itemId: string;
  /** Keyless: the key and rationale arrive only with the server's score. */
  item: KeylessItem;
}

/** Plays a bank item the way a student would, with the answer checked by the server. */
export function PlayItem({ itemId, item }: PlayItemProps) {
  async function submitResponse(response: AnyResponse): Promise<ScoreReveal> {
    const result = await fetch(`/author/items/${itemId}/play/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    // Any failure rejects, and ItemPlayer says the answer could not be checked.
    if (!result.ok) throw new Error(`score request failed with ${result.status}`);
    return (await result.json()) as ScoreReveal;
  }

  const player = <ItemPlayer item={item} submit={submitResponse} />;
  // A Trend item or standalone bowtie reads from its record, as a student would see it.
  return item.ehr ? <RecordLayout record={item.ehr}>{player}</RecordLayout> : player;
}
