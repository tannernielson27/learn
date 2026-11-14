import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import { multipleChoiceFixture } from "@/lib/ngn/fixtures/selection";
import { Landing } from "./Landing";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// What `landingEntry` gives a visitor (#366, #563).
const VISITOR = {
  href: "/sign-up",
  label: "Start your free trial",
  also: { href: "/sign-in", label: "Sign in" },
};
const TEACHER = { href: "/author", label: "Go to your quizzes" };

// Emoji drawn as emoji; the footer's copyright sign is pictographic too, and is not one.
const EMOJI = /\p{Emoji_Presentation}/u;

const fixture = multipleChoiceFixture.canonical;

/**
 * What only the fixture's key or rationale would put on the page (#563). The page draws the
 * fixture's question, so this is its key and every rationale line, by id and by words, and the
 * wire names a key or a score travels under.
 */
const KEY_MARKERS = [
  "answerKey",
  "correctOptionId",
  fixture.answerKey.correctOptionId,
  '"rationale"',
  "perElement",
  "maxPoints",
  '"points"',
  '"score"',
  "zero_one",
  fixture.rationale.general.value,
  ...Object.values(fixture.rationale.perElement ?? {}).map((text) => text.value),
];

function keyMarkersIn(html: string): string[] {
  return KEY_MARKERS.filter((marker) => html.includes(marker));
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Landing (#264, #563)", () => {
  // #269: the help pages are public, so the front page's footer points at them. #522: so are
  // pricing, the terms and the privacy policy, in the one site footer.
  it("links to help, pricing, terms and privacy from the site footer", () => {
    render(<Landing entry={VISITOR} />);
    const footer = within(screen.getByRole("contentinfo")).getByRole("navigation", {
      name: "Footer",
    });
    for (const [name, href] of [
      ["Help", "/help"],
      ["Pricing", "/pricing"],
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
    ]) {
      expect(within(footer).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Every patient shown in LeaRN is fictional.",
    );
  });

  it("has the site header: the wordmark home, Pricing and Sign in", () => {
    render(<Landing entry={VISITOR} />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "LeaRN" })).toHaveAttribute("href", "/");
    const site = within(header).getByRole("navigation", { name: "Site" });
    expect(
      within(site)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Pricing", "Sign in"]);
  });

  it("says in its one headline that the quizzes are the exam's and run live in class", () => {
    render(<Landing entry={VISITOR} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Next Generation NCLEX quizzes, live in class.");
    const hero = screen.getByRole("region", { name: headings[0]?.textContent ?? "" });
    expect(hero).toHaveTextContent(
      "Students answer on their phones, and every question is scored like the exam.",
    );
    expect(hero).toHaveTextContent("For nursing faculty");
  });

  it("offers the free trial first, with Sign in beside it", () => {
    render(<Landing entry={VISITOR} />);
    const main = screen.getByRole("main");
    const [first, second] = within(main).getAllByRole("link");
    expect([first?.textContent, first?.getAttribute("href")]).toEqual([
      "Start your free trial",
      "/sign-up",
    ]);
    expect([second?.textContent, second?.getAttribute("href")]).toEqual(["Sign in", "/sign-in"]);
    // The main action is the large button; Sign in beside it is the same height.
    expect(first?.className).toContain("min-h-(--button-height-lg)");
    expect(second?.className).toContain("min-h-(--button-height-lg)");
  });

  it("swaps Sign in for the signed-in visitor's own home, in the hero and the header", () => {
    render(<Landing entry={TEACHER} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start your free trial" })).toBeNull();
    const home = screen.getAllByRole("link", { name: "Go to your quizzes" });
    expect(home.length).toBeGreaterThan(0);
    for (const link of home) expect(link).toHaveAttribute("href", "/author");
    // The student's door is there for everyone.
    expect(screen.getByRole("form", { name: "Join a live session" })).toBeInTheDocument();
  });

  it("gives a student the join code form on the page itself, after the teacher's actions", () => {
    render(<Landing entry={VISITOR} />);
    const hero = screen.getByRole("region", {
      name: "Next Generation NCLEX quizzes, live in class.",
    });
    const form = within(hero).getByRole("form", { name: "Join a live session" });
    expect(within(form).getByRole("textbox", { name: "Join code" })).toBeRequired();
    expect(within(form).getByRole("button", { name: "Join" })).toBeInTheDocument();
    expect(form).toHaveTextContent("In class now? No account needed.");
    const trial = within(hero).getByRole("link", { name: "Start your free trial" });
    expect(trial.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a live session beside the headline: the projector, phones and the count", () => {
    render(<Landing entry={VISITOR} />);
    const figure = screen.getByRole("figure", { name: /a live session as the class sees it/i });
    expect(within(figure).getByTestId("live-class-count")).toHaveTextContent("18 of 24 answered");
    expect(within(figure).getByTestId("live-class-projector")).toHaveTextContent(
      fixture.stem.value,
    );
  });

  it("states the price, the trial and that students are free, with a link to pricing", () => {
    render(<Landing entry={VISITOR} />);
    const hero = screen.getByRole("region", {
      name: "Next Generation NCLEX quizzes, live in class.",
    });
    expect(hero).toHaveTextContent(
      "7-day free trial, then $39.99 a month per workspace. Free for students.",
    );
    const price = screen.getByRole("region", { name: "Pricing" });
    expect(price).toHaveTextContent("$39.99");
    expect(within(price).getByText("a month per workspace")).toBeInTheDocument();
    expect(price).toHaveTextContent("Up to 10 teachers in one workspace");
    expect(price).toHaveTextContent("A 7-day free trial");
    expect(price).toHaveTextContent("Free for students");
    expect(price).toHaveTextContent(/for nursing faculty teaching for the next generation nclex/i);
    expect(within(price).getByRole("link", { name: "See pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(within(price).getByRole("link", { name: "Start your free trial" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("has four numbered sections under the headline, in order", () => {
    render(<Landing entry={VISITOR} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "How a live session works",
      "Every Next Generation NCLEX format",
      "Assignments and practice",
      "Pricing",
    ]);
  });

  it("walks a teacher through a live session in four steps, in the glossary's words", () => {
    render(<Landing entry={VISITOR} />);
    const how = screen.getByRole("region", { name: "How a live session works" });
    expect(
      within(how)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      "Write or import a quiz",
      "Start a live session",
      "Students join with a code",
      "Reveal and review",
    ]);
  });

  it("names every format and the six-step case study", () => {
    render(<Landing entry={VISITOR} />);
    const formats = screen.getByRole("region", { name: "Every Next Generation NCLEX format" });
    expect(
      within(formats)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Multiple choice",
      "Select all that apply",
      "Matrix",
      "Drop-down",
      "Highlight",
      "Drag-and-drop",
      "Ordered response",
      "Bowtie",
    ]);
    expect(formats).toHaveTextContent("Six-step case studies");
    expect(formats).toHaveTextContent(/scored by the exam's rules/);
  });

  it("names assignments and practice", () => {
    render(<Landing entry={VISITOR} />);
    const beyond = screen.getByRole("region", { name: "Assignments and practice" });
    expect(
      within(beyond)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Assignments", "Practice", "Reports"]);
  });

  // Trust that is true today (#563): nothing that would need a customer to say it.
  it("claims no testimonial, school, rating or user count", () => {
    const html = renderToStaticMarkup(<Landing entry={VISITOR} />);
    expect(html).not.toMatch(/<blockquote|[“”]|★|\btestimonial|\btrusted by\b|\brated\b/i);
    expect(html).not.toMatch(/\b\d[\d,]*\+? (?:teachers|students|schools|programs)\b(?! in one)/i);
  });

  it("uses the glossary's words, no emoji, and never links to the component gallery", () => {
    const html = renderToStaticMarkup(<Landing entry={VISITOR} />);
    expect(findRetiredTerms(html)).toEqual([]);
    render(<Landing entry={VISITOR} />);
    expect(document.body.textContent).not.toMatch(EMOJI);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/gallery/);
    }
  });

  // Keys never reach a student's browser (CLAUDE.md). The page draws a fixture's question; the
  // control proves the same check finds the key when a page does carry it.
  it("carries the drawn question's words and nothing of its key or rationale", () => {
    const html = renderToStaticMarkup(<Landing entry={VISITOR} />);
    expect(html).toContain(fixture.content.options[0]?.label);
    expect(keyMarkersIn(html)).toEqual([]);

    const leaky = renderToStaticMarkup(
      <main>
        <p>{fixture.stem.value}</p>
        <script
          type="application/json"
          // The fixture, and what a scored answer would add to it.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ fixture, scored: { score: 1, points: 1 } }),
          }}
        />
      </main>,
    );
    expect(keyMarkersIn(leaky)).toEqual(KEY_MARKERS);
  });

  it("is the finished drawing under reduced motion, with nothing held back", () => {
    stubReducedMotion(true);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    render(<Landing entry={VISITOR} />);
    const play = screen.getByTestId("live-class-play");
    expect(play).not.toHaveAttribute("data-demo");
    expect(within(play).getByTestId("live-class-count")).toHaveTextContent("18 of 24 answered");
  });
});
