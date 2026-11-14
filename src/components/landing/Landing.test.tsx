import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { multipleChoiceFixture } from "@/lib/ngn/fixtures/selection";
import { Landing } from "./Landing";
import { SPECIMEN } from "./specimen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// What `landingEntry` gives a visitor (#366). The landing page names it for the free trial (#563).
const VISITOR = {
  href: "/sign-up",
  label: "Create an account",
  also: { href: "/sign-in", label: "Sign in" },
};
const TEACHER = { href: "/author", label: "Go to your quizzes" };

const HEADLINE = "Next Generation NCLEX quizzes, live in your classroom.";

describe("Landing (#264, #563)", () => {
  it("says what LeaRN is in its one headline, and who it is for", () => {
    render(<Landing entry={VISITOR} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(HEADLINE);
    expect(screen.getByRole("main")).toHaveTextContent(
      "Students answer on their phones, in the exam’s own layout, and every question is scored like the exam.",
    );
    expect(
      screen.getAllByText(/For nursing faculty teaching for the Next Generation NCLEX/).length,
    ).toBeGreaterThan(0);
  });

  it("offers a visitor the free trial first, at sign-up, with Sign in beside it", () => {
    render(<Landing entry={VISITOR} />);
    const hero = screen.getByRole("region", { name: HEADLINE });
    const links = within(hero).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Start your free trial", "/sign-up"],
      ["Sign in", "/sign-in"],
    ]);
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    // Every hero action is the large size, so none sits taller than another.
    for (const link of links) expect(link.className).toContain("min-h-(--button-height-lg)");
  });

  it("offers a signed-in visitor their own home under its own label, and no Sign in", () => {
    render(<Landing entry={TEACHER} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start your free trial" })).toBeNull();
    for (const link of screen.getAllByRole("link", { name: "Go to your quizzes" })) {
      expect(link).toHaveAttribute("href", "/author");
    }
    // The student's door is there whoever is looking.
    expect(screen.getByRole("textbox", { name: "Join code" })).toBeInTheDocument();
  });

  it("draws the site header: the wordmark home, Pricing and Sign in", () => {
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

  it("has a join code form for students that goes where /join goes, without JavaScript", () => {
    render(<Landing entry={VISITOR} />);
    const door = screen.getByRole("region", { name: "Join a live session" });
    expect(door).toHaveTextContent("In class now? No account needed.");
    const field = within(door).getByRole("textbox", { name: "Join code" });
    const form = field.closest("form");
    expect(form).toHaveAttribute("action", "/join");
    expect(form).toHaveAttribute("method", "get");
    expect(field).toHaveAttribute("name", "code");
    expect(within(door).getByRole("button", { name: "Join" })).toHaveAttribute("type", "submit");
  });

  it("shows a live session: the projector and phones, the join code and the answer count", () => {
    render(<Landing entry={VISITOR} />);
    const live = screen.getByRole("region", {
      name: "One question on the screen, an answer from every phone.",
    });
    const picture = within(live).getByRole("img");
    expect(picture).toHaveAccessibleName(/18 of 24 answered/);
    expect(picture).toHaveAccessibleName(/V96 RN8/);
    expect(picture).toHaveTextContent("18 of 24 answered");
    expect(picture).toHaveTextContent("Answer sent");
    expect(picture).toHaveTextContent(multipleChoiceFixture.canonical.stem.value);
    // The projector stays light whatever the theme; so do the phones beside it.
    expect(picture.querySelectorAll('[data-theme="light"]').length).toBeGreaterThanOrEqual(3);
    // The legend names each callout.
    const legend = within(live).getByRole("figure").querySelector("figcaption");
    for (const label of ["Join code", "Answer count", "NCLEX layout", "Reveal"]) {
      expect(legend).toHaveTextContent(label);
    }
  });

  it("explains how it works in four steps, in the glossary's words", () => {
    render(<Landing entry={VISITOR} />);
    const how = screen.getByRole("region", { name: /From a quiz to a reviewed answer/ });
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

  it("lists every format, the six-step case study, assignments and practice", () => {
    render(<Landing entry={VISITOR} />);
    const formats = screen.getByRole("region", { name: /Every Next Generation NCLEX format/ });
    expect(
      within(formats)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
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
    expect(formats).toHaveTextContent(/six questions, one for each clinical judgment step/);
    for (const step of ["Recognize Cues", "Evaluate Outcomes", "Assignments", "Practice"]) {
      expect(formats).toHaveTextContent(step);
    }
  });

  it("states the price, the trial, the teacher cap and free for students, and links pricing", () => {
    render(<Landing entry={VISITOR} />);
    const price = screen.getByRole("region", { name: "One price for the whole workspace." });
    for (const fact of [
      "$39.99",
      "a month per workspace",
      "Up to 10 teachers",
      "7-day free trial",
      "Free for students",
    ]) {
      expect(price).toHaveTextContent(fact);
    }
    expect(within(price).getByRole("link", { name: "See pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(within(price).getByRole("link", { name: "Start your free trial" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("shows no social proof it does not have: no quote, rating or count of users", () => {
    render(<Landing entry={VISITOR} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b(?:testimonial|trusted by|rated|stars?|reviews?)\b/i);
    expect(document.querySelector("blockquote")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(text).not.toMatch(/\p{Emoji_Presentation}/u);
  });

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

  it("does not link to the component gallery", () => {
    render(<Landing entry={VISITOR} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/gallery/);
    }
    expect(screen.queryByText(/gallery/i)).toBeNull();
  });
});

/**
 * #563: the specimen is drawn from the multiple choice fixture, which carries an answer key and a
 * rationale. None of it may reach the page. Every key-shaped thing the fixture holds is looked for
 * in the page's markup and in the specimen's data, and the control proves the same search finds
 * each one when it is there.
 */
describe("the landing page carries no answer key (#563)", () => {
  const question = multipleChoiceFixture.canonical;
  const rationale = question.rationale;
  // Keys as JSON writes them, so the word "rationale" in a sentence is not a leak but the field is.
  const leaks = [
    '"answerKey":',
    '"correctOptionId":',
    '"rationale":',
    '"perElement":',
    '"scoring":',
    question.id,
    question.answerKey.correctOptionId,
    ...question.content.options.map((option) => option.id),
    rationale?.general?.value ?? "",
    ...Object.values(rationale?.perElement ?? {}).map((text) => text.value),
  ].filter((marker) => marker !== "");

  const found = (text: string) => leaks.filter((marker) => text.includes(marker));

  it("finds every marker when a page does carry the key (the control)", () => {
    // As a Flight payload would carry it: JSON in a script, quotes and all.
    const leaky = renderToStaticMarkup(
      <script
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(question) }}
      />,
    );
    expect(found(leaky)).toEqual(leaks);
  });

  it("finds none in the rendered page, signed out or in, or in the specimen's data", () => {
    for (const entry of [VISITOR, TEACHER]) {
      const html = renderToStaticMarkup(<Landing entry={entry} />);
      expect(html).toContain(question.stem.value);
      expect(found(html)).toEqual([]);
    }
    expect(found(JSON.stringify(SPECIMEN))).toEqual([]);
  });
});
