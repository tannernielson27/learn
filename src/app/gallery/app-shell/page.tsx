import { AppShellSpecimens } from "./demo";

/**
 * The signed-in app's frame (#563, docs/04 §11): every state of `AppShell` and `AccountMenu`,
 * drawn from fixtures with no session behind them.
 *
 * Opened by URL and from the Primitives page, not from the gallery nav, as `/gallery/billing` is:
 * a nav entry would change the sidebar in every full-page gallery baseline.
 */
export default function AppShellGallery() {
  return (
    <article className="max-w-6xl">
      <p className="text-sm text-ink-2">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">App shell</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        The frame of every signed-in page: the wordmark, the navigation, the account menu with who
        is signed in, and the content column.
      </p>
      <AppShellSpecimens />
    </article>
  );
}
