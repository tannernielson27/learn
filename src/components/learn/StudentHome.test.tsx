import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  HOME_FIXTURE_ASSIGNMENTS,
  HOME_FIXTURE_CLASSES,
  HOME_FIXTURE_CLASSES_TWO_WORKSPACES,
  HOME_FIXTURE_HISTORY,
  HOME_FIXTURE_LIVE,
  HOME_FIXTURE_NO_STEPS,
  HOME_FIXTURE_PRACTICE,
  HOME_FIXTURE_PROGRESS,
  HOME_FIXTURE_STEPS,
} from "@/lib/learn/studentHomeFixture";
import { StudentHome, STUDENT_JOIN_NOTE, type StudentHomeProps } from "./StudentHome";
import { SECTION_HEADING_CLASSES } from "@/components/ui/PageHeader";

vi.mock("@/app/join/codeActions", () => ({ openJoinCode: vi.fn() }));

const joinClass = vi.fn(async () => ({ status: "idle" as const }));

const FIRST_USE: StudentHomeProps = {
  classes: HOME_FIXTURE_CLASSES,
  assignments: [],
  practice: [],
  history: [],
  steps: HOME_FIXTURE_NO_STEPS,
  live: [],
  joinClass,
};

const POPULATED: StudentHomeProps = {
  classes: HOME_FIXTURE_CLASSES,
  assignments: HOME_FIXTURE_ASSIGNMENTS,
  progress: HOME_FIXTURE_PROGRESS,
  practice: HOME_FIXTURE_PRACTICE,
  history: HOME_FIXTURE_HISTORY,
  steps: HOME_FIXTURE_STEPS,
  live: HOME_FIXTURE_LIVE,
  joinClass,
};

const SECTION_HEADINGS = [
  "Assignments",
  "Results",
  "Live sessions",
  "Practice",
  "Your clinical judgment steps",
];

describe("StudentHome (#563)", () => {
  it("puts the join code form first, right after the title, with the student's own line", () => {
    render(<StudentHome {...POPULATED} />);
    const title = screen.getByRole("heading", { level: 1, name: "Your classes" });
    const join = screen.getByRole("form", { name: "Join a live session" });
    expect(within(join).getByRole("textbox", { name: "Join code" })).toHaveAttribute(
      "name",
      "code",
    );
    expect(within(join).getByRole("button", { name: "Join" })).toHaveAttribute("type", "submit");
    expect(join).toHaveTextContent(STUDENT_JOIN_NOTE);
    expect(join).not.toHaveTextContent("No account needed");
    // Before every section and the pick-up card, in the document's order.
    expect(title.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const heading of screen.getAllByRole("heading", { level: 2 })) {
      expect(join.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The old button at the foot of the page is gone: one way in, not two.
    expect(screen.queryByRole("link", { name: "Join a live session" })).toBeNull();
  });

  it("shows one first-use empty state, and no empty section, when a student has nothing yet", () => {
    const { container } = render(<StudentHome {...FIRST_USE} />);
    expect(container.querySelectorAll("[data-empty-state]")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Nothing here yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Assignments and practice quizzes from your teacher show here."),
    ).toBeInTheDocument();
    for (const name of SECTION_HEADINGS) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
    for (const gone of ["No open assignments", "No closed assignments yet", "No answers yet"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.getByRole("form", { name: "Join a live session" })).toBeInTheDocument();
    expect(screen.getByText("Join another class")).toBeInTheDocument();
  });

  it("keeps every section with rows under its heading, and no empty state", () => {
    const { container } = render(<StudentHome {...POPULATED} />);
    for (const name of SECTION_HEADINGS) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(container.querySelector("[data-empty-state]")).toBeNull();
    expect(screen.getByRole("list", { name: "Open assignments" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Pick up where you left off" }),
    ).not.toHaveClass("eyebrow");
    // One section heading style with the teacher's pages (#563).
    expect(screen.getByRole("heading", { level: 2, name: "Assignments" })).toHaveClass(
      ...SECTION_HEADING_CLASSES.split(" "),
    );
  });

  it("collapses the empty sections and keeps the ones with rows", () => {
    render(<StudentHome {...FIRST_USE} assignments={HOME_FIXTURE_ASSIGNMENTS} />);
    expect(screen.getByRole("region", { name: "Assignments" })).toBeInTheDocument();
    for (const name of SECTION_HEADINGS.slice(1)) {
      expect(screen.queryByRole("region", { name })).toBeNull();
    }
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).toBeNull();
  });

  it("keeps a section that did not load, with its message", () => {
    render(<StudentHome {...FIRST_USE} practice={null} />);
    expect(
      within(screen.getByRole("region", { name: "Practice" })).getByText(/did not load/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).toBeNull();
  });

  it("shows a student with no class the class code next, and no first-use state", () => {
    render(<StudentHome {...FIRST_USE} classes={[]} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "You are not in a class yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Join a class" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nothing here yet" })).toBeNull();
    expect(screen.getByRole("form", { name: "Join a live session" })).toBeInTheDocument();
  });

  it("names no workspace for a student in one, and each class's for a student in two", () => {
    const { unmount } = render(<StudentHome {...POPULATED} />);
    const one = screen.getByRole("list", { name: "Your classes" });
    expect(one).not.toHaveTextContent("LeaRN");
    expect(screen.queryByText("LeaRN")).toBeNull();
    unmount();

    render(<StudentHome {...POPULATED} classes={HOME_FIXTURE_CLASSES_TWO_WORKSPACES} />);
    const two = screen.getByRole("list", { name: "Your classes" });
    expect(within(two).getByText("LeaRN")).toBeInTheDocument();
    expect(within(two).getByText("Riverside College of Nursing")).toBeInTheDocument();
  });
});
