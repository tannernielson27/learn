"use client";

import { useSyncExternalStore } from "react";
import { AiImportReview, type AiImportReviewActions } from "@/components/authoring/AiImportReview";
import type { ReviewEntryView } from "@/lib/authoring/aiImportReview";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before screenshots. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

const NOT_HERE = { ok: false as const, code: "gallery", message: "Not in the gallery." };

/** Gallery-only: every action answers that it is not available, and nothing is sent anywhere. */
const ACTIONS: AiImportReviewActions = {
  drop: async () => NOT_HERE,
  restore: async () => NOT_HERE,
  importBatch: async () => NOT_HERE,
  discard: async () => NOT_HERE,
};

export function AiImportReviewDemo({ entries }: { entries: ReviewEntryView[] }) {
  const hydrated = useHydrated();
  return (
    <div data-hydrated={hydrated} data-testid="ai-import-review-demo" className="mt-6">
      <AiImportReview
        bankId="00000000-0000-4000-8000-0000000000d1"
        quizName="Medical-surgical review"
        batchId="00000000-0000-4000-8000-0000000000b1"
        fileNames={["Med-surg review.md"]}
        entries={entries}
        actions={ACTIONS}
      />
    </div>
  );
}
