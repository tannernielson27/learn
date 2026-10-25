import type { Metadata } from "next";
import { LiveSessionHistory } from "@/components/learn/LiveSessionHistory";
import { LiveSessionResults } from "@/components/learn/LiveSessionResults";
import {
  LIVE_FIXTURE_CLASS_ID,
  LIVE_HISTORY_FIXTURE,
  liveResultEntriesFixture,
} from "@/lib/learn/liveResultsFixture";

export const metadata: Metadata = { title: "Student live results" };

const CLASSES = new Map([[LIVE_FIXTURE_CLASS_ID, { name: "NUR 310", timeZone: "America/Denver" }]]);

/**
 * A student's own live session results, from the fixtures: the Live sessions list on their home
 * and one ended session's results page, as `/learn` and `/learn/live/[sessionId]` draw them.
 *
 * Under `/gallery/live` rather than in the nav: a nav entry restales every visual baseline. Like
 * every gallery route it is closed on production (`src/proxy.ts`, `scripts/gallery-closed.mjs`),
 * because a results page shows the key and the rationale.
 */
export default function StudentLiveResultsGalleryPage() {
  return (
    <article className="max-w-wide">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Student live results</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        What a student sees of an ended live session they joined signed in for their class: the list
        on their home, and the session&apos;s results with each key and rationale.
      </p>
      <section
        aria-labelledby="gallery-live-history"
        data-testid="gallery-live-history"
        className="mt-8 max-w-xl"
      >
        <h2 id="gallery-live-history" className="mb-3 text-lg font-semibold text-ink-1">
          Live sessions
        </h2>
        <LiveSessionHistory rows={LIVE_HISTORY_FIXTURE} classes={CLASSES} />
      </section>
      <section
        aria-label="Live session results"
        data-testid="gallery-live-results"
        className="mt-12"
      >
        <p className="eyebrow mb-2">Live session results</p>
        <p className="font-read text-display leading-tight break-words text-ink-1">
          Heart failure: fluid balance
        </p>
        <LiveSessionResults entries={liveResultEntriesFixture()} />
      </section>
    </article>
  );
}
