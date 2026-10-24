import type { Metadata } from "next";
import { StagePodium } from "@/components/live/stage/StagePodium";
import { rankPodium } from "@/lib/live/podium";
import { PODIUM_FIXTURES } from "@/lib/live/podiumFixture";

export const metadata: Metadata = { title: "End of session podium" };

const SUMMARY = { questionsRun: 6, itemCount: 6, joined: 68 };

/**
 * The top 5 on the projector when a live session ends, from `PODIUM_FIXTURES`, each on a 1280×720
 * stage (the smaller of the two projector sizes it is checked at). Under `/gallery/live` rather
 * than in the nav, as the results views are: a nav entry restales every visual baseline.
 */
export default function PodiumGalleryPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">End of session podium</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        What the projector shows when a live session ends and someone scored: the top 5 by the
        report&rsquo;s totals, ties sharing a place. Each stage is 1280 by 720 and scrolls sideways
        on a narrow screen.
      </p>
      <div className="mt-8 space-y-10">
        {PODIUM_FIXTURES.map(({ name, label, scores }) => {
          const podium = rankPodium(scores);
          if (podium === null) return null;
          return (
            <section key={name} aria-labelledby={`podium-${name}`} className="space-y-3">
              <h2 id={`podium-${name}`} className="font-read text-xl text-ink-1">
                {label}
              </h2>
              <div
                // A stage wider than a phone: its own scroll box, reachable from the keyboard.
                tabIndex={0}
                role="region"
                aria-label={`${label}, projector view`}
                className="max-w-full overflow-x-auto rounded-sm border border-line"
              >
                <div
                  data-theme="light"
                  data-testid={`podium-${name}`}
                  className="relative h-[720px] w-[1280px] bg-stage-surface text-stage-ink [container-type:size]"
                >
                  <div className="flex h-full flex-col px-(--stage-pad-inline) py-(--stage-pad-block)">
                    <StagePodium
                      title="Cardiac week 3: heart failure"
                      podium={podium}
                      summary={SUMMARY}
                      rate={91}
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
