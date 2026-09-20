import type { ItemType } from "@/lib/ngn/labels";
import { publishBlockers } from "@/lib/ngn/quality";
import type { Item } from "@/lib/ngn/schemas";
import { validateItem } from "@/lib/ngn/validate";

export const PUBLISH_CHECK_ERRORS = {
  incomplete: "The item is not complete yet. Fix the problems listed, then publish.",
  noRationale:
    "Write the rationale before publishing. It goes in the Rationale box, below the answers.",
} as const;

export type PublishCheck = { ok: true; item: Item } | { ok: false; error: string };

/**
 * Whether submitted input may be published as an item of the given type: it must validate, be
 * that type, and carry a general rationale (spec §6; owner decision 2026-09-19). Every other
 * quality warning stays advice and never blocks. Runs on the server, whatever the editor showed.
 */
export function checkPublishable(input: unknown, type: ItemType): PublishCheck {
  const result = validateItem(input);
  if (!result.ok || result.value.type !== type) {
    return { ok: false, error: PUBLISH_CHECK_ERRORS.incomplete };
  }
  if (publishBlockers(result.value).length > 0) {
    return { ok: false, error: PUBLISH_CHECK_ERRORS.noRationale };
  }
  return { ok: true, item: result.value };
}
