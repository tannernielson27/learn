import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import { JOIN_CODE_ERROR } from "@/lib/live/joinForm";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { Landing } from "./Landing";

// What `landingEntry` gives a visitor (#366, #563), and a signed-in teacher.
const VISITOR = {
  href: "/sign-up",
  label: "Start your free trial",
  also: { href: "/sign-in", label: "Sign in" },
};
const TEACHER = { href: "/author", label: "Go to your quizzes" };

// The footer's copyright sign is a pictographic code point, but not an emoji.
const EMOJI = /(?!\u00a9)\p{Extended_Pictographic}/u;

beforeEach(() => {
  push.mockReset();
});

describe("Landing: the hero (#563)", () => {
  it("says what LeaRN is in its one headline, for nursing faculty", () => {
    render(<Landing entry={VISITOR} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Next Generation NCLEX quizzes, live in class.");
    const hero = screen.getByRole("region", { name: /Next Generation NCLEX quizzes/ });
    expect(hero).toHaveTextContent("For nursing faculty");
    expect(hero).toHaveTextContent(
      "Students answer on their phones. Every question is scored the way the exam scores it.",
    );
  });

  it("offers the free trial first with Sign in beside it, then the price of the trial", () => {
    render(<Landing entry={VISITOR} />);
    const hero = screen.getByRole("region", { name: /Next Generation NCLEX quizzes/ });
    const links = within(hero).getAllByRole("link");
    expect(links.slice(0, 2).map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Start your free trial", "/sign-up"],
      ["Sign in", "/sign-in"],
    ]);
    expect(hero).toHaveTextContent("7 days free, then $39.99 a month per workspace.");
  });

  it("swaps the trial and Sign in for a signed-in teacher's own home, everywhere", () => {
    render(<Landing entry={TEACHER} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start your free trial" })).toBeNull();
    expect(screen.queryByText(/7 days free/)).toBeNull();
    const home = screen.getAllByRole("link", { name: "Go to your quizzes" });
    expect(home.length).toBeGreaterThan(0);
    for (const link of home) expect(link).toHaveAttribute("href", "/author");
    // The student's door does not depend on who is looking.
    expect(screen.getByRole("textbox", { name: "Join code" })).toBeInTheDocument();
  });

  it("draws the bar and the hero on the brand band, with the wordmark home", () => {
    render(<Landing entry={VISITOR} />);
    const header = screen.getByRole("banner");
    expect(header.closest('[data-surface="brand"]')).not.toBeNull();
    expect(within(header).getByRole("link", { name: "LeaRN" })).toHaveAttribute("href", "/");
    const site = within(header).getByRole("navigation", { name: "Site" });
    expect(
      within(site)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Pricing", "Help"]);
    const hero = screen.getByRole("region", { name: /Next Generation NCLEX quizzes/ });
    expect(hero).toHaveAttribute("data-surface", "brand");
  });
});

describe("Landing: the student's join code form (#563)", () => {
  function codeField() {
    return screen.getByRole("textbox", { name: "Join code" });
  }

  it("is a plain GET form to /join, so it works without JavaScript", () => {
    render(<Landing entry={VISITOR} />);
    const form = screen.getByRole("form", { name: "In class now? No account needed." });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/join");
    const field = codeField();
    expect(field).toHaveAttribute("name", "code");
    expect(field).toHaveAttribute("autocapitalize", "characters");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "9");
    expect(within(form).getByRole("button", { name: "Join" })).toHaveAttribute("type", "submit");
  });

  it("normalises the typed code and goes to the same join page a QR code opens", async () => {
    const user = userEvent.setup();
    render(<Landing entry={VISITOR} />);
    await user.type(codeField(), "v96-rn8");
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(push).toHaveBeenCalledWith("/join/V96RN8");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits from the keyboard with Enter", async () => {
    const user = userEvent.setup();
    render(<Landing entry={VISITOR} />);
    await user.type(codeField(), "v96 rn8{Enter}");
    expect(push).toHaveBeenCalledWith("/join/V96RN8");
  });

  it("names an empty code beside the field and keeps focus there", async () => {
    const user = userEvent.setup();
    render(<Landing entry={VISITOR} />);
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(JOIN_CODE_ERROR);
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(codeField()).toHaveAccessibleDescription(JOIN_CODE_ERROR);
    expect(codeField()).toHaveFocus();
  });

  it("refuses a code that could not name a live session, with the same message", async () => {
    const user = userEvent.setup();
    render(<Landing entry={VISITOR} />);
    await user.type(codeField(), "ABC");
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(JOIN_CODE_ERROR);
    // Typing again clears the message.
    await user.type(codeField(), "D");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Landing: the picture of a live session (#563)", () => {
  it("shows the projector's question, its lettered choices and how many have answered", () => {
    render(<Landing entry={VISITOR} />);
    const figure = screen.getByRole("figure", { name: /A live session in class/ });
    const projector = within(figure).getByTestId("demo-projector");
    expect(projector).toHaveAttribute("data-theme", "light");
    expect(projector).toHaveTextContent(/heart failure/);
    expect(within(projector).getAllByRole("listitem")).toHaveLength(4);
    expect(within(projector).getByTestId("answer-count")).toHaveTextContent("18 of 24 answered");
    expect(projector).toHaveTextContent("V96 RN8");
  });

  it("draws phones answering, hidden from assistive technology as a repeat of the projector", () => {
    const { container } = render(<Landing entry={VISITOR} />);
    const phones = container.querySelectorAll(".demo-rise");
    expect(phones.length).toBe(3);
    for (const phone of phones) expect(phone.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container).toHaveTextContent("Answer sent");
  });
});

describe("Landing: what it is, who it is for and what it costs (#563)", () => {
  it("says who it is for", () => {
    render(<Landing entry={VISITOR} />);
    expect(screen.getByRole("region", { name: "Who it is for" })).toHaveTextContent(
      "Built for nursing faculty teaching for the Next Generation NCLEX.",
    );
  });

  it("says how a live session works in four numbered steps, in the glossary's words", () => {
    render(<Landing entry={VISITOR} />);
    const how = screen.getByRole("region", { name: "How a live session works" });
    expect(
      within(how)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Step 1: Write a quiz",
      "Step 2: Start a live session",
      "Step 3: Students join with the join code",
      "Step 4: Show the answer and review",
    ]);
  });

  it("names every format and the six-step case study", () => {
    render(<Landing entry={VISITOR} />);
    const formats = screen.getByRole("region", { name: "Every Next Generation NCLEX format" });
    expect(
      within(formats)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replace(/^\d\d/, "")),
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
    expect(formats).toHaveTextContent(/Case studies\..*six questions, one for each clinical/);
  });

  it("names assignments and practice", () => {
    render(<Landing entry={VISITOR} />);
    const own = screen.getByRole("region", { name: "Assignments and practice" });
    expect(own).toHaveTextContent(/Assign a quiz or a case study to a class/);
    expect(own).toHaveTextContent(/Share a quiz for practice/);
  });

  it("shows the price, the trial, the teacher cap and that students are free, with pricing", () => {
    render(<Landing entry={VISITOR} />);
    const price = screen.getByRole("region", { name: "Pricing" });
    expect(price).toHaveTextContent("$39.99");
    expect(price).toHaveTextContent("a month per workspace");
    expect(price).toHaveTextContent("Up to 10 teachers in one workspace");
    expect(price).toHaveTextContent("A 7-day free trial");
    expect(price).toHaveTextContent("Free for students");
    expect(within(price).getByRole("link", { name: "See pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("closes with the band again: the entry and pricing", () => {
    render(<Landing entry={VISITOR} />);
    const start = screen.getByRole("region", {
      name: "Bring your next class into a live session.",
    });
    expect(start).toHaveAttribute("data-surface", "brand");
    expect(
      within(start)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Start your free trial", "/sign-up"],
      ["See pricing", "/pricing"],
    ]);
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

  it("uses the glossary's words, no emoji, and no gallery", () => {
    const html = renderToStaticMarkup(<Landing entry={VISITOR} />);
    expect(findRetiredTerms(html)).toEqual([]);
    render(<Landing entry={VISITOR} />);
    expect(document.body.textContent).not.toMatch(EMOJI);
    expect(document.body.textContent).not.toMatch(/gallery/i);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/gallery/);
    }
  });
});
