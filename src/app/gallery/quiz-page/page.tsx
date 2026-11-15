import { QuizPageDemo, type QuizPageDemoState } from "./demo";

// Here, not in the client demo: a "use client" module's values reach the server as references.
const QUIZ_PAGE_DEMO_STATES: readonly QuizPageDemoState[] = [
  "questions",
  "empty",
  "filtered",
  "no-results",
  "editor",
  "editor-problems",
];

function parseState(value: string | string[] | undefined): QuizPageDemoState {
  return QUIZ_PAGE_DEMO_STATES.find((state) => state === value) ?? "questions";
}

/**
 * The quiz page (`/author/banks/[bankId]`) and the question editor's frame
 * (`/author/items/[itemId]`), drawn from `quizPageFixture.ts` and a gallery item fixture with no
 * database behind them, so the screenshot suite and the #563 review can see them. `?state=` picks
 * one: `questions` (the default: six questions and a case study), `empty` (a new quiz),
 * `filtered` (a step and a type chosen), `no-results` (a search that found nothing), `editor` (a
 * published question) and `editor-problems` (a draft with two problems before Publish). Every form
 * answers that it is not available here.
 *
 * The editor holds the fixture's key, as `/gallery/items/[type]` does, so this route is probed by
 * `scripts/gallery-closed.mjs`. Opened by URL, not from the gallery nav, as `/gallery/library` is.
 */
export default async function QuizPageGallery({ searchParams }: PageProps<"/gallery/quiz-page">) {
  const state = parseState((await searchParams).state);
  const editor = state === "editor" || state === "editor-problems";
  return (
    <article>
      <p className="eyebrow">Composites</p>
      {/* Not a heading: the quiz's name, or Edit question, is this page's h1, as on the real page. */}
      <p className="mt-2 text-2xl font-semibold">{editor ? "Question editor" : "Quiz page"}</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        {editor
          ? "The question page's frame around the real editor, on a fixture. Saving, Duplicate and Archive answer that they are not available here."
          : "One fictional quiz. Every form answers that it is not available here."}
      </p>
      <div data-testid="quiz-page-demo">
        <QuizPageDemo state={state} />
      </div>
    </article>
  );
}
