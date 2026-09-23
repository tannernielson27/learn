import type { Metadata } from "next";
import Link from "next/link";
import { DistributionView } from "@/components/live/results/DistributionView";
import { distributionFor } from "@/lib/live/results";
import { allFixtures } from "@/lib/ngn/fixtures";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { itemSchema, type Item } from "@/lib/ngn/schemas";

export const metadata: Metadata = { title: "Results views" };

/**
 * The host console's results views (#180), one per item type, drawn from the fixtures: each
 * canonical item answered by every scoring case the fixture documents, so the counts are real
 * answers rather than invented ones. `?revealed=1` shows them as they look once the host has
 * shown the answer.
 *
 * Under `/gallery/live` rather than in the nav: a nav entry restales every visual baseline. Like
 * every gallery route it is closed on production (`src/proxy.ts`, `scripts/gallery-closed.mjs`),
 * because a distribution marks the correct choices.
 */
export default async function ResultsGalleryPage({
  searchParams,
}: PageProps<"/gallery/live/results">) {
  const revealed = (await searchParams).revealed === "1";
  const rooms = allFixtures.map((fixture) => ({
    type: fixture.type,
    distribution: distributionFor(
      itemSchema.parse(fixture.canonical) as Item,
      fixture.cases.map((sample) => sample.response),
    ),
  }));

  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Results views</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        How a room answered each item type, as the host console draws it. Nothing is marked correct
        until the host shows the answer, so a projected console does not give it away.
      </p>
      <nav aria-label="Answer state" className="mt-4 flex flex-wrap gap-2">
        <StateLink href="/gallery/live/results" current={!revealed}>
          Before the answer is shown
        </StateLink>
        <StateLink href="/gallery/live/results?revealed=1" current={revealed}>
          After the answer is shown
        </StateLink>
      </nav>
      <div className="mt-8 space-y-10">
        {rooms.map(({ type, distribution }) => (
          <section
            key={type}
            aria-labelledby={`results-${type}`}
            data-testid={`results-${type}`}
            className="rounded-sm border border-line bg-surface-1 px-4 py-5 sm:px-6"
          >
            <h2 id={`results-${type}`} className="font-read mb-4 text-xl text-ink-1">
              {ITEM_TYPE_LABELS[type]}
            </h2>
            <DistributionView
              distribution={distribution}
              revealed={revealed}
              name={ITEM_TYPE_LABELS[type]}
            />
          </section>
        ))}
      </div>
    </article>
  );
}

function StateLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`tap-target inline-flex items-center rounded-sm border px-3 text-sm ${
        current
          ? "border-accent bg-accent-soft font-medium text-accent-ink"
          : "border-line text-ink-1 hover:bg-surface-2"
      }`}
    >
      {children}
    </Link>
  );
}
