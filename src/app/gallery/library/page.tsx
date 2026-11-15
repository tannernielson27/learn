import { LIBRARY_DEMO_STATES, LibraryDemo, type LibraryDemoState } from "./demo";

function parseState(value: string | string[] | undefined): LibraryDemoState {
  return LIBRARY_DEMO_STATES.find((state) => state === value) ?? "start";
}

/**
 * The teacher's library (`/author`) drawn from `libraryFixture.ts`, with no database behind it, so
 * the screenshot suite and the #563 review can see it. `?state=` picks one: `start` (quizzes, no
 * folder yet, Get started with the sample in), `empty` (a first visit), `folders` (the rail),
 * `folder` (inside one) and `all-filed`. Every form answers that it is not available here.
 *
 * Opened by URL, not from the gallery nav, as `/gallery/class-page` is: a nav entry would change
 * the sidebar in every full-page gallery baseline.
 */
export default async function LibraryGallery({ searchParams }: PageProps<"/gallery/library">) {
  const state = parseState((await searchParams).state);
  return (
    <article>
      <p className="eyebrow">Composites</p>
      {/* Not a heading: "Library" is this page's h1, as it is on the real page. */}
      <p className="mt-2 text-2xl font-semibold">Library</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        The teacher&apos;s home with fictional quizzes and folders. Every form answers that it is
        not available here.
      </p>
      {/* The gallery's own gutter, which the header's create form measures itself against. */}
      <div data-testid="library-demo" className="[--shell-gutter:1.25rem]">
        <LibraryDemo state={state} />
      </div>
    </article>
  );
}
