import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ITEM_TYPES, ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { CJMM_STEP_LABELS } from "@/lib/ngn/types";
import { helpSectionId } from "@/lib/help/itemGuide";
import HelpIndex from "./page";
import InstructorGuide from "./instructor/page";
import ItemGuide from "./items/page";

describe("/help/items", () => {
  // #269: reads the app's own list, so a new item type cannot ship without a section here.
  it.each(ITEM_TYPES)("has a section for %s", (type) => {
    const { container } = render(<ItemGuide />);
    const section = container.querySelector(`section#${helpSectionId(type)}`);
    expect(section, `no section#${helpSectionId(type)}`).not.toBeNull();
    const heading = within(section as HTMLElement).getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent(ITEM_TYPE_LABELS[type]);
    expect(within(section as HTMLElement).getByText("How it is scored")).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText("Tip")).toBeInTheDocument();
  });

  it("links to every item section from its contents list", () => {
    render(<ItemGuide />);
    const contents = screen.getByRole("navigation", { name: "On this page" });
    for (const type of ITEM_TYPES) {
      const link = within(contents).getByRole("link", { name: ITEM_TYPE_LABELS[type] });
      expect(link).toHaveAttribute("href", `#${helpSectionId(type)}`);
    }
  });

  it("covers the case study, the Trend question and all six clinical judgment steps", () => {
    render(<ItemGuide />);
    expect(screen.getByRole("heading", { level: 3, name: "Case study" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Trend question" })).toBeInTheDocument();
    for (const [step, label] of Object.entries(CJMM_STEP_LABELS)) {
      expect(screen.getByRole("heading", { level: 3, name: `${step}. ${label}` })).toBeVisible();
    }
  });

  it("explains a drop-down rationale item's dyad and triad scoring", () => {
    const { container } = render(<ItemGuide />);
    const section = container.querySelector("section#dropdown-rationale") as HTMLElement;
    expect(section).toHaveTextContent(/1 point only if both are correct/);
    expect(section).toHaveTextContent(/Anchor wrong: 0/);
  });

  it("gives every image alt text and its size", () => {
    render(<ItemGuide />);
    const images = screen.getAllByRole("img");
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.getAttribute("alt")?.trim()).toBeTruthy();
      expect(Number(image.getAttribute("width"))).toBeGreaterThan(0);
      expect(Number(image.getAttribute("height"))).toBeGreaterThan(0);
    }
  });
});

describe("/help/instructor", () => {
  const SECTIONS = [
    ["sign-in", "Sign up and sign in"],
    ["banks", "Create or import a quiz"],
    ["items", "Write questions"],
    ["classes", "Create a class and invite students"],
    ["assign", "Assign a quiz"],
    ["live", "Start a live session"],
    ["reports", "Read the reports"],
    ["practice", "Share a quiz for practice"],
  ] as const;

  it("walks from signing up to sharing a quiz for practice", () => {
    render(<InstructorGuide />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(SECTIONS.map(([, title]) => title));
  });

  // Other pages link to these, so an id outlives a change of title (#416).
  it("keeps each section's anchor, and lists them all in its contents", () => {
    const { container } = render(<InstructorGuide />);
    const contents = screen.getByRole("navigation", { name: "On this page" });
    for (const [id, title] of SECTIONS) {
      const section = container.querySelector(`section#${id}`) as HTMLElement;
      expect(section, `no section#${id}`).not.toBeNull();
      expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent(title);
      expect(within(contents).getByRole("link", { name: title })).toHaveAttribute("href", `#${id}`);
    }
  });

  it("gives each topic a screen might link to an anchor of its own", () => {
    const { container } = render(<InstructorGuide />);
    const topics = [...container.querySelectorAll("section [data-help-topic]")].map((el) => el.id);
    expect(topics).toEqual([
      "sign-up",
      "password",
      "colleagues",
      "import",
      "folders",
      "publish",
      "history",
      "case-studies",
      "invite",
      "class-code",
      "time-zone",
      "remove",
      "assign-students",
      "assign-close",
      "reminders",
      "pacing",
      "live-results",
      "timer",
      "practice-answers",
    ]);
    expect(new Set(topics).size).toBe(topics.length);
    for (const id of topics) {
      const topic = container.querySelector(`#${id}`) as HTMLElement;
      expect(within(topic).getByRole("heading", { level: 3 })).toBeInTheDocument();
    }
  });

  it("gives every image alt text and its size", () => {
    render(<InstructorGuide />);
    for (const image of screen.getAllByRole("img")) {
      expect(image.getAttribute("alt")?.trim()).toBeTruthy();
      expect(Number(image.getAttribute("width"))).toBeGreaterThan(0);
    }
  });
});

describe("/help", () => {
  it("links to both guides and has a paragraph for students", () => {
    render(<HelpIndex />);
    expect(screen.getByRole("link", { name: "Teacher guide" })).toHaveAttribute(
      "href",
      "/help/instructor",
    );
    expect(screen.getByRole("link", { name: "Question guide" })).toHaveAttribute(
      "href",
      "/help/items",
    );
    expect(screen.getByRole("heading", { level: 2, name: "For students" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", { name: "create an account" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    for (const id of ["students", "students-live", "students-class", "students-results"]) {
      expect(document.getElementById(id), `no #${id}`).not.toBeNull();
    }
  });
});
