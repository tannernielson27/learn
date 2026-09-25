import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "next/dist/client/components/error-boundary";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ErrorInfo } from "next/error";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #235: every boundary hands what it caught to Sentry. The DSN check and the scrub live behind
// this call and are tested in src/lib/observability; here it is only whether the call is made.
const reporting = vi.hoisted(() => ({
  reportClientError: vi.fn(),
  startClientReporting: vi.fn(),
}));
vi.mock("@/lib/observability/reportError", () => reporting);

import AuthorError from "./author/error";
import CaseStudyError from "./author/case-studies/[caseStudyId]/error";
import PlayItemError from "./author/items/[itemId]/play/error";
import RootError from "./error";
import GlobalError from "./global-error";
import HostError from "./live/[sessionId]/error";
import PlayError from "./play/[sessionId]/error";

/** What a render error carries that must never reach the screen. */
const SECRET = "Cannot read properties of null (reading 'position') at /_next/static/chunks/x.js";

const BOUNDARIES: [string, ComponentType<ErrorInfo>][] = [
  ["the student room", PlayError],
  ["the host console", HostError],
  ["authoring", AuthorError],
  ["the case study builder", CaseStudyError],
  ["an item or case study being played", PlayItemError],
  ["any other page (the root boundary)", RootError],
];

/**
 * A page that fails to render until `fix` is called: the shape of a bad response that the next
 * request gets right. React renders a failed tree twice before handing it to a boundary, so a page
 * that failed only once would never reach one.
 */
function flakyPage() {
  let broken = true;
  function Page() {
    if (broken) {
      const error = new Error(SECRET) as Error & { digest?: string };
      error.digest = "4031337";
      throw error;
    }
    return <p>The room is back</p>;
  }
  return { Page, fix: () => (broken = false) };
}

function routerWith(refresh: () => void): AppRouterInstance {
  return {
    refresh,
    back: vi.fn(),
    forward: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  } as unknown as AppRouterInstance;
}

/**
 * Next's own segment boundary, the one `error.tsx` is mounted in, so what is tested is what the
 * app does: which prop the file is handed, and what that prop does with the router.
 */
function renderInSegment(errorComponent: ComponentType<ErrorInfo>) {
  const refresh = vi.fn();
  const { Page, fix } = flakyPage();
  render(
    <AppRouterContext.Provider value={routerWith(refresh)}>
      <ErrorBoundary errorComponent={errorComponent}>
        <Page />
      </ErrorBoundary>
    </AppRouterContext.Provider>,
  );
  return { refresh, fix };
}

describe("route error boundaries", () => {
  beforeEach(() => {
    // React reports every caught render error; the boundary is doing its job here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(BOUNDARIES)(
    "%s shows a calm message, the digest as a reference, and never the message",
    (_, Boundary) => {
      renderInSegment(Boundary);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      // #267, kickoff decision 4: the digest is the one thing about the error that may show.
      expect(screen.getByText("4031337")).toBeInTheDocument();
      const shown = document.body.textContent ?? "";
      expect(shown).not.toMatch(/Cannot read|position|chunks|Error/);
    },
  );

  it.each(BOUNDARIES)(
    "%s asks the server for the page again and renders it on Try again",
    async (_, Boundary) => {
      const { refresh, fix } = renderInSegment(Boundary);
      fix();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("The room is back")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      // `retry`, not `reset`: the server component above the room runs again (#164).
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it.each(BOUNDARIES)("%s reports the error it caught, once", (_, Boundary) => {
    reporting.reportClientError.mockClear();
    renderInSegment(Boundary);

    expect(reporting.reportClientError).toHaveBeenCalledTimes(1);
    const [reported] = reporting.reportClientError.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error & { digest?: string }).digest).toBe("4031337");
  });

  it("the student room says the student keeps their place", () => {
    renderInSegment(PlayError);

    expect(screen.getByRole("alert")).toHaveTextContent("Your place in the session is kept.");
  });
});

describe("global error", () => {
  it("renders a whole document with a calm message, the digest, and no error details", () => {
    const error = new Error(SECRET) as Error & { digest?: string };
    error.digest = "4031337";
    const html = renderToStaticMarkup(
      <GlobalError error={error} retry={vi.fn()} reset={vi.fn()} />,
    );

    expect(html).toMatch(/^<html/);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).toContain("4031337");
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toMatch(/Cannot read|position|chunks|Error/);
  });

  it("reports the error it caught", () => {
    reporting.reportClientError.mockClear();
    // It renders its own <html>, which React warns about inside a test container.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(SECRET);
    render(<GlobalError error={error} retry={vi.fn()} reset={vi.fn()} />);

    expect(reporting.reportClientError).toHaveBeenCalledWith(error);
    vi.restoreAllMocks();
  });
});
