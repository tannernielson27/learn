import { itemQualityWarnings } from "@/lib/ngn/quality";
import { fromItemRow, type ItemRow } from "@/lib/supabase/itemRows";

/**
 * How many quality warnings a stored item has, worked out on the server from its whole row (key
 * and rationale included) so that only the count ever reaches the page. An unfinished draft counts
 * none: warnings judge a complete item, and the draft's problems are listed in its editor.
 */
export function storedWarningCount(row: ItemRow): number {
  const stored = fromItemRow(row);
  return stored.ok ? itemQualityWarnings(stored.value).length : 0;
}
