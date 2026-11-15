"use client";

import { AttemptPlayer } from "@/components/assignments/AttemptPlayer";
import type { AttemptItemPayload } from "@/lib/assignments/attemptView";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";

const saveHere = async () => ({ ok: true as const });
const submitHere = async () => ({ error: "Not in the gallery." });

/**
 * The assignment's player with every save answering that it was saved and Submit that it is not
 * available here. The items, keyless, and the charts were cut on the server.
 */
export function AttemptDemo({
  items,
  total,
  records,
}: {
  items: readonly AttemptItemPayload[];
  total: number;
  records: readonly (EhrRecordView | null)[];
}) {
  return (
    <AttemptPlayer
      attemptId="00000000-0000-4000-8000-0000005630f0"
      attemptNumber={1}
      items={items}
      total={total}
      records={records}
      submit={submitHere}
      save={saveHere}
    />
  );
}
