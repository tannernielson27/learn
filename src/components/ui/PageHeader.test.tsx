import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import {
  PAGE_LABEL_CLASSES,
  PAGE_TITLE_CLASSES,
  PageHeader,
  SECTION_HEADING_CLASSES,
} from "./PageHeader";

describe("PageHeader", () => {
  it("is the page's one h1 in the display-section serif, alone when given only a title", () => {
    const { container } = render(<PageHeader title="Library" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Library" });
    expect(heading).toHaveClass("display-section");
    expect(heading.className).toBe(PAGE_TITLE_CLASSES);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("header")).toHaveTextContent(/^Library$/);
  });

  it("wraps a long title anywhere, so it never widens the page at 320px", () => {
    expect(PAGE_TITLE_CLASSES).toContain("wrap-anywhere");
    expect(PAGE_TITLE_CLASSES).toContain("min-w-0");
    // Not the copied app class string: one title style, the editorial one (docs/04 §11).
    expect(PAGE_TITLE_CLASSES).not.toContain("text-display");
  });

  it("puts the lead under the title at reading width", () => {
    render(<PageHeader title="Library" lead="Every quiz you have made." />);
    const lead = screen.getByText("Every quiz you have made.");
    expect(lead).toHaveClass("measure", "text-ink-2");
  });

  it("holds the main action after the words", () => {
    render(<PageHeader title="Library" action={<Button variant="primary">New quiz</Button>} />);
    const header = screen.getByRole("banner");
    const [heading, button] = [
      within(header).getByRole("heading"),
      within(header).getByRole("button", { name: "New quiz" }),
    ];
    expect(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens with a back link above the title", () => {
    render(
      <PageHeader
        title="Week 3 cardiac"
        back={{ href: "/author", label: "Back to the library" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Back to the library" });
    expect(link).toHaveAttribute("href", "/author");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("can head a part of a page as an h2, named by its id", () => {
    render(<PageHeader title="Reports" level={2} titleId="reports-title" />);
    expect(screen.getByRole("heading", { level: 2, name: "Reports" })).toHaveAttribute(
      "id",
      "reports-title",
    );
  });

  it("names what the title is on a sentence-case line above it", () => {
    render(<PageHeader title="Mr. Ruiz, day 2" label="Case study" />);
    const label = screen.getByText("Case study");
    expect(label).toHaveClass("text-sm", "font-medium", "text-ink-2");
    expect(label).not.toHaveClass("eyebrow", "uppercase");
    const heading = screen.getByRole("heading", { level: 1, name: "Mr. Ruiz, day 2" });
    expect(label.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shares one section heading style, a step under the title", () => {
    expect(SECTION_HEADING_CLASSES).toBe("text-lg font-medium text-ink-1");
    expect(PAGE_LABEL_CLASSES).not.toMatch(/uppercase|tracking/);
  });
});
