"use client";

import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { RendererLoading } from "./RendererLoading";
import { RendererShownMarker } from "./RendererShown";

/** What a student sees in the question's place when its renderer could not load. */
export const RENDERER_FAILED = "This question could not load.";

interface BoundaryProps {
  onError: () => void;
  onRetry: () => void;
  /** Offered once a retry in place has failed as well. */
  onReload?: () => void;
  children: ReactNode;
}

/**
 * Catches a renderer that fails, above all one whose chunk never arrived (#54: a flaky network, or
 * a deploy that renamed the chunks while a session was open). It holds only the question area, so
 * the page's status line, reconnect notice, step navigation and case-study tabs keep working.
 * It is reset by remounting (its key), never from inside.
 *
 * Nothing about the error is shown: its message can name a chunk URL, and a stack is no use to a
 * student. React already reports every caught error through console.error, so there is no logging
 * here either; the repo logs only on the server.
 */
class RendererBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-48 flex-col items-start justify-center gap-4 rounded-md border border-line bg-surface-1 p-5">
        {/* An alert because it is a real error; it appears only on failure, so it never competes
            with the page's own status line in the normal case. */}
        <div role="alert">
          <p className="text-ink-1">{RENDERER_FAILED}</p>
          <p className="mt-1 text-sm text-ink-2">
            {this.props.onReload
              ? "If it still does not load, reload the page. Answers you have not submitted may be lost."
              : "Check your connection, then try again."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={this.props.onRetry}>Try again</Button>
          {this.props.onReload ? (
            <Button variant="ghost" onClick={this.props.onReload}>
              Reload the page
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
}

interface RecoverableProps {
  item: { id: string; type: string };
}

/**
 * Wraps a lazily loaded renderer so a failed load stays inside the question area and can be retried.
 *
 * Why the retry has to swap components: `next/dynamic` is `React.lazy` over the loader
 * (next/dist/shared/lib/lazy-dynamic/loadable.js), and `React.lazy` keeps a rejected load for the
 * life of the page. Remounting the same component throws the same error without touching the
 * network. So after a failure the wrapper replaces it with a new `React.lazy` over `load`, a fresh
 * `import()` of the same module. Turbopack's runtime forgets a chunk that failed (it retries a
 * network error once, then drops the entry), so a new `import()` really does fetch it again: that
 * covers a dropped connection without losing the student's place.
 *
 * It does not cover a deploy that renamed the chunks: the old URL will 404 however often it is
 * asked for, and only a reload brings the new names. A reload is not done for the student, though:
 * a case study keeps its steps in memory, so reloading one starts it over. Try again always retries
 * in place; once that has failed too, a "Reload the page" button is offered beside it, with a
 * warning, and the student chooses.
 *
 * The swap is shared by every mount of the renderer, so a player mounted after a failure (the next
 * case-study step, the next live item) makes a real attempt too. A new item resets the boundary.
 */
export function withLoadRecovery<P extends RecoverableProps>(
  initial: ComponentType<P>,
  load: () => Promise<ComponentType<P>>,
  reload: () => void = () => window.location.reload(),
): ComponentType<P> {
  let current: ComponentType<P> = initial;
  const replace = () => {
    current = lazy(() => load().then((loaded) => ({ default: loaded })));
  };

  function RecoverableRenderer(props: P) {
    const itemKey = `${props.item.type}:${props.item.id}`;
    const [shownFor, setShownFor] = useState(itemKey);
    const [retries, setRetries] = useState(0);
    if (shownFor !== itemKey) {
      setShownFor(itemKey);
      setRetries(0);
    }
    const Renderer = current;
    return (
      <RendererBoundary
        key={`${itemKey}:${retries}`}
        onError={replace}
        onRetry={() => setRetries(retries + 1)}
        onReload={retries > 0 ? reload : undefined}
      >
        <Suspense fallback={<RendererLoading />}>
          <Renderer {...props} />
          <RendererShownMarker />
        </Suspense>
      </RendererBoundary>
    );
  }
  RecoverableRenderer.displayName = "RecoverableRenderer";
  return RecoverableRenderer;
}
