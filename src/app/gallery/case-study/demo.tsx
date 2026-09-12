"use client";

import { useState, useSyncExternalStore } from "react";
import { CaseStudyPlayer } from "@/components/case-study/CaseStudyPlayer";
import { Button } from "@/components/ui/Button";
import type { CaseStudy } from "@/lib/ngn/schemas";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before screenshots. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

/**
 * Gallery-only harness. Scores locally with the answer key in the browser, which is fine here
 * and never acceptable in sessions or assignments.
 */
export function CaseStudyDemo({
  caseStudy,
  maxPoints,
}: {
  caseStudy: CaseStudy;
  maxPoints: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const hydrated = useHydrated();

  return (
    <div data-hydrated={hydrated}>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
          Start again
        </Button>
        <span className="ml-auto font-mono text-xs text-ink-2">
          6 steps · max {maxPoints} points
        </span>
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-line">
        <CaseStudyPlayer key={attempt} caseStudy={caseStudy} />
      </div>
    </div>
  );
}
