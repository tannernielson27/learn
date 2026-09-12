import { ITEM_TYPES } from "@/lib/ngn/labels";

export default function GalleryOverviewPage() {
  return (
    <article className="measure">
      <p className="eyebrow">Overview</p>
      <h1 className="mt-2 text-2xl font-semibold">What the gallery is for</h1>
      <p className="mt-4 text-ink-2">
        Every component in LeaRN is demonstrated here from its canonical fixture before it ships
        anywhere else. Sprint demos run from this page, Playwright screenshots are taken from it,
        and reviewers open it on a phone before approving a pull request.
      </p>
      <h2 className="mt-8 text-lg font-semibold">Adding an entry</h2>
      <p className="mt-2 text-ink-2">
        Register the item type in the NGN registry with its schema, scorer and fixture, add the
        renderer under the question components folder, then add a route under the gallery that
        renders the canonical fixture in answer, review and feedback modes.
      </p>
      <p className="mt-8 text-sm text-ink-2">
        {ITEM_TYPES.length} item types are registered in the core. Renderers arrive in Sprints 1 and
        2.
      </p>
    </article>
  );
}
