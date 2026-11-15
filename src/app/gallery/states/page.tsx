import type { ReactNode } from "react";
import ClassesLoading from "@/app/author/classes/(list)/loading";
import SessionsLoading from "@/app/author/sessions/loading";
import WorkspaceLoading from "@/app/author/workspace/loading";
import StudentHomeLoading from "@/app/learn/(home)/loading";
import { AccountSkeleton } from "@/components/auth/AccountSkeleton";
import { AuthFrame } from "@/components/auth/AuthFrame";
import {
  AuthorNotFoundView,
  LearnNotFoundView,
  RootNotFoundView,
} from "@/components/status/NotFoundViews";
import { AppShell } from "@/components/ui/AppShell";
import { ErrorDemo } from "./demo";
import { isErrorState, parseStateId, STATES, type StateId } from "./states";

/** The screens that are not an error view, each as its route file draws it. */
const SCREENS: Partial<Record<StateId, () => ReactNode>> = {
  // The real loading file wraps this in `AuthFrame`, whose main the gallery cannot repeat.
  "loading-account": () => (
    <AuthFrame landmark={false}>
      <AccountSkeleton />
    </AuthFrame>
  ),
  "loading-classes": () => <ClassesLoading />,
  "loading-sessions": () => <SessionsLoading />,
  "loading-workspace": () => <WorkspaceLoading />,
  "loading-student-home": () => <StudentHomeLoading />,
  "not-found-root": () => <RootNotFoundView landmark={false} />,
  "not-found-author": () => <AuthorNotFoundView />,
  "not-found-learn": () => <LearnNotFoundView />,
};

/**
 * Every route's loading, error and not-found screen (#563, docs/04 §11), one per `?state=` (see
 * `states.ts`), so each has one h1 as on the real page and a baseline of its own
 * (`e2e/statesGallery.spec.ts`). Each is drawn in the frame its route has: the teacher's or the
 * student's `AppShell`, without its landmarks, or the page's own frame.
 *
 * The loading and not-found screens are the route files themselves; an error screen is the view its
 * `error.tsx` draws (`RouteErrorViews`), with no error thrown, so nothing reaches Sentry. Opened by
 * URL, not from the gallery nav: a nav entry would change the sidebar in every full-page baseline.
 */
export default async function StatesGallery({ searchParams }: PageProps<"/gallery/states">) {
  const state = parseStateId((await searchParams).state);
  const { label, file, frame } = STATES[state];
  const screen = isErrorState(state) ? <ErrorDemo state={state} /> : SCREENS[state]?.();

  return (
    <article>
      <p className="text-sm text-ink-2">Composites</p>
      {/* Not a heading: the screen's own title is the h1, as on the real page. */}
      <p className="mt-2 text-2xl font-semibold">{label}</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        <code className="font-mono text-sm break-all">{file}</code>
      </p>
      <div
        data-testid="states-demo"
        data-state={state}
        className="-mx-5 flex flex-col border-y border-line bg-surface-0 sm:mx-0 sm:border-x"
      >
        {frame === "own" ? (
          screen
        ) : (
          <AppShell
            landmarks={false}
            homeHref="#states-demo"
            width={frame === "teacher" ? "wide" : "full"}
          >
            {frame === "student" ? (
              // `LearnContentWidth` reads the path: the home is wide, every other page a reading
              // column. The gallery's path is neither, so the width is the one the route has.
              <div
                className={`mx-auto w-full ${
                  state === "loading-student-home" ? "max-w-wide" : "max-w-reading"
                }`}
              >
                {screen}
              </div>
            ) : (
              screen
            )}
          </AppShell>
        )}
      </div>
    </article>
  );
}
