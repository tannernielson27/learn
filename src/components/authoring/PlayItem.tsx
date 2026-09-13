"use client";

import { ItemPlayer } from "@/components/question/ItemPlayer";
import type { KeylessItem } from "@/lib/authoring/play";
import type { ScoreReveal } from "@/lib/authoring/scoreRequest";
import type { AnyResponse } from "@/lib/ngn/schemas";

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

  return <ItemPlayer item={item} submitResponse={submitResponse} />;
}
