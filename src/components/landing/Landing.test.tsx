import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "./Landing";

// What `landingEntry` gives a visitor (#366). The name is kept from when Sign in came first.
const SIGN_IN = {
  href: "/sign-up",
  label: "Create an account",
  also: { href: "/sign-in", label: "Sign in" },
};

describe("Landing (#264)", () => {
  // #269: the help pages are public, so the front page's footer points at them.
  it("links to help from its footer", () => {
    render(<Landing entry={SIGN_IN} />);
    const footer = screen.getByRole("navigation", { name: "Footer" });
    expect(within(footer).getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
  });

  it("says what LeaRN is in its one headline", () => {
    render(<Landing entry={SIGN_IN} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Live learning for the Next Generation NCLEX");
  });

  it("offers an account first, then Sign in and Join a live session, and no form or pricing", () => {
    render(<Landing entry={SIGN_IN} />);
    const actions = screen.getAllByRole("link").slice(0, 3);
    expect(actions.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Create an account", "/sign-up"],
      ["Sign in", "/sign-in"],
      ["Join a live session", "/join"],
    ]);
    expect(screen.queryByRole("link", { name: /pricing|contact/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("names who it is for and what it does", () => {
    render(<Landing entry={SIGN_IN} />);
    const what = screen.getByRole("region", { name: "What LeaRN does" });
    for (const phrase of [
      /nclex question formats/i,
      /quizzes/i,
      /live sessions/i,
      /assignments/i,
    ]) {
      expect(what).toHaveTextContent(phrase);
    }
    expect(what).toHaveTextContent(/join code.*no account needed/i);
    expect(
      screen.getByText("Every NCLEX question format, scored like the exam."),
    ).toBeInTheDocument();
  });

  // #416: the page says each thing once.
  it("has one section under the headline and no second", () => {
    render(<Landing entry={SIGN_IN} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What LeaRN does",
    ]);
    expect(screen.queryByRole("region", { name: "How to get in" })).toBeNull();
  });

  it("swaps Sign in for the signed-in visitor's own home", () => {
    render(<Landing entry={{ href: "/author", label: "Go to your quizzes" }} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to your quizzes" })).toHaveAttribute(
      "href",
      "/author",
    );
    expect(screen.getByRole("link", { name: "Join a live session" })).toBeInTheDocument();
  });

  // fix/landing-hero: the hero's actions are one size, so none sits taller or shorter than another.
  it("draws every hero action at the same large size, signed in or out", () => {
    for (const entry of [SIGN_IN, { href: "/author", label: "Go to your quizzes" }]) {
      const { unmount } = render(<Landing entry={entry} />);
      const names = [entry.label, ...("also" in entry ? [entry.also.label] : [])];
      for (const name of [...names, "Join a live session"]) {
        expect(screen.getByRole("link", { name }).className).toContain(
          "min-h-(--button-height-lg)",
        );
      }
      unmount();
    }
  });

  it("shows one sample, labeled Sample, sized up front so nothing shifts", () => {
    render(<Landing entry={SIGN_IN} />);
    const figure = screen.getByRole("figure");
    expect(within(figure).getByText("Sample")).toBeInTheDocument();
    const image = within(figure).getByRole("img");
    expect(image).toHaveAccessibleName(/case study/i);
    expect(image).toHaveAttribute("width", "929");
    expect(image).toHaveAttribute("height", "634");
  });

  it("no longer links to the component gallery", () => {
    render(<Landing entry={SIGN_IN} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/gallery/);
    }
    expect(screen.queryByText(/gallery/i)).toBeNull();
  });
});
