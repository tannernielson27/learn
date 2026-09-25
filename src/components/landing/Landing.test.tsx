import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "./Landing";

const SIGN_IN = { href: "/sign-in", label: "Sign in" };

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

  it("offers Sign in and Join a live session, and nothing to sign up with", () => {
    render(<Landing entry={SIGN_IN} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Join a live session" })).toHaveAttribute(
      "href",
      "/join",
    );
    expect(screen.queryByRole("link", { name: /sign up|register|pricing/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("explains that accounts come from the owner and students come through a class invite", () => {
    render(<Landing entry={SIGN_IN} />);
    const access = screen.getByRole("region", { name: "How to get in" });
    expect(access).toHaveTextContent(/instructor accounts are set up by the site's owner/i);
    expect(access).toHaveTextContent(/class invite/i);
  });

  it("names who it is for and what it does", () => {
    render(<Landing entry={SIGN_IN} />);
    const what = screen.getByRole("region", { name: "What LeaRN does" });
    for (const phrase of [/exam-faithful/i, /authoring/i, /live sessions/i, /take-home/i]) {
      expect(what).toHaveTextContent(phrase);
    }
    expect(screen.getByRole("region", { name: "Who it is for" })).toHaveTextContent(
      /nursing instructors/i,
    );
  });

  it("swaps Sign in for the signed-in visitor's own home", () => {
    render(<Landing entry={{ href: "/author", label: "Go to your item banks" }} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to your item banks" })).toHaveAttribute(
      "href",
      "/author",
    );
    expect(screen.getByRole("link", { name: "Join a live session" })).toBeInTheDocument();
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
