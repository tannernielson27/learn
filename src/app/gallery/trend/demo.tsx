"use client";

import { useState, useSyncExternalStore } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Button } from "@/components/ui/Button";
import { sampleTrendItem } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before screenshots. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

const item = itemSchema.parse(sampleTrendItem);
const times = item.ehr?.timePoints.length ?? 0;

/**
 * Gallery-only harness. Scores locally with the answer key in the browser, which is fine here
 * and never acceptable in sessions or assignments.
 */
export function TrendDemo() {
  const [attempt, setAttempt] = useState(0);
  const hydrated = useHydrated();

  return (
    <div data-hydrated={hydrated}>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
          Reset
        </Button>
        <span className="ml-auto font-mono text-xs text-ink-2">
          {times} time points · max {item.scoring.maxPoints}
        </span>
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-line">
        <RecordLayout record={item.ehr!}>
          <ItemPlayer key={attempt} item={item} />
        </RecordLayout>
      </div>
    </div>
  );
}
