import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CLASS_PAGE_FIXTURE_ASSIGNMENTS,
  CLASS_PAGE_FIXTURE_BANKS,
  CLASS_PAGE_FIXTURE_CLASS,
  CLASS_PAGE_FIXTURE_NOW,
  CLASS_PAGE_FIXTURE_ROSTER,
  CLASS_PAGE_FIXTURE_SHARES,
} from "@/lib/classes/classPageFixture";
import {
  PROGRESS_FIXTURE,
  PROGRESS_FIXTURE_SESSION_LIST,
} from "@/lib/classes/classProgressFixture";
import { CLASS_TABS, classTabReads, type ClassTab } from "@/lib/classes/classTabs";
import { buildClassProgress } from "@/lib/classes/progress";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import { ClassPageView, type ClassPageViewProps } from "./ClassPageView";

const PROGRESS = buildClassProgress(PROGRESS_FIXTURE);
const URL_TEXT = "https://learn.example/c/Gx7_q2LmVb9TzR4wKc1NpHs8YdQe3UaJ";
const ACTIONS: ClassPageViewProps["actions"] = {
  rename: async () => ({ status: "saved" }),
  setTimeZone: async () => ({ status: "saved" }),
  rotateInvite: async () => ({ ok: true }),
  removeStudentFor: () => async () => ({ ok: true }),
  editAssignmentFor: () => async () => ({ status: "saved" }),
  deleteAssignmentFor: () => async () => {},
  share: async () => ({ status: "shared" }),
  stopSharingFor: () => async () => ({ ok: true }),
};

function renderTab(tab: ClassTab, overrides: Partial<ClassPageViewProps> = {}) {
  return render(
    <ClassPageView
      detail={CLASS_PAGE_FIXTURE_CLASS}
      url={URL_TEXT}
      roster={CLASS_PAGE_FIXTURE_ROSTER}
      assignments={CLASS_PAGE_FIXTURE_ASSIGNMENTS}
      shares={CLASS_PAGE_FIXTURE_SHARES}
      banks={CLASS_PAGE_FIXTURE_BANKS}
      progress={PROGRESS}
      sessions={PROGRESS_FIXTURE_SESSION_LIST}
      zones={["America/Denver", "America/New_York", "UTC"]}
      now={CLASS_PAGE_FIXTURE_NOW}
      tab={tab}
      actions={ACTIONS}
      {...overrides}
    />,
  );
}

const h2s = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("ClassPageView", () => {
  it.each(CLASS_TABS)(
    "on %s, needs nothing the page leaves unread for it (classTabReads)",
    (tab) => {
      const reads = classTabReads(tab);
      // The page passes null for a list it did not read, the same null as a failed read.
      renderTab(tab, {
        roster: reads.has("roster") ? CLASS_PAGE_FIXTURE_ROSTER : null,
        assignments: reads.has("assignments") ? CLASS_PAGE_FIXTURE_ASSIGNMENTS : null,
        shares: reads.has("shares") ? CLASS_PAGE_FIXTURE_SHARES : null,
        banks: reads.has("banks") ? CLASS_PAGE_FIXTURE_BANKS : null,
        progress: reads.has("progress") ? PROGRESS : null,
        sessions: reads.has("sessions") ? PROGRESS_FIXTURE_SESSION_LIST : null,
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument();
      expect(screen.getByText("4 students")).toBeVisible();
    },
  );

  it.each(CLASS_TABS)(
    "on %s, keeps the header: the name, the count, the code and the link",
    (tab) => {
      renderTab(tab);
      expect(
        screen.getByRole("heading", { level: 1, name: "NUR 310 Adult Health, Fall" }),
      ).toBeVisible();
      expect(screen.getByText("4 students")).toBeVisible();
      expect(screen.getByTestId("class-code")).toHaveTextContent("HK7M-2QPW");
      expect(screen.getByRole("textbox", { name: "Invite link" })).toHaveValue(URL_TEXT);
      expect(screen.getByRole("link", { name: "Start a live session" })).toHaveAttribute(
        "href",
        `/author/classes/${CLASS_PAGE_FIXTURE_CLASS.id}/start`,
      );
      expect(
        within(screen.getByRole("navigation", { name: "Class views" })).getByRole("link", {
          current: "page",
        }),
      ).toHaveAttribute("aria-current", "page");
    },
  );

  it.each(CLASS_TABS)("on %s, uses only the glossary's words", (tab) => {
    const { container } = renderTab(tab);
    expect(findRetiredTerms(container.innerHTML, "Class")).toEqual([]);
  });

  it("opens on a summary, the next assignment, who joined last and the QR code", () => {
    renderTab("overview");
    expect(h2s()).toEqual(["At a glance", "Open now", "Recently joined", "Invite students"]);
    expect(screen.getByText("Week 8: Heart failure case study")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View progress for Week 8: Heart failure case study" }),
    ).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: "Recently joined" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining("Priya Shah"),
      expect.stringContaining("sam.lee@example.test"),
      expect.stringContaining("Kai Ortiz"),
    ]);
    expect(
      screen.getByRole("img", { name: "QR code for the NUR 310 Adult Health, Fall invite link" }),
    ).toBeVisible();
    // The full lists and every control are on the other tabs.
    expect(screen.queryByRole("list", { name: "Roster" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Assignments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace the link" })).not.toBeInTheDocument();
  });

  it("says what could not be read on the overview, rather than showing a zero", () => {
    renderTab("overview", { roster: null, assignments: null, shares: null });
    expect(screen.queryByText(/^\d+ students?$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Could not be loaded. Reload the page to try again.").length).toBe(
      5,
    );
  });

  it("puts the roster on Students, under a heading that takes focus after a remove", () => {
    renderTab("students");
    expect(h2s()).toEqual(["Roster"]);
    expect(screen.getByRole("heading", { level: 2, name: "Roster" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(
      within(screen.getByRole("list", { name: "Roster" })).getAllByRole("listitem"),
    ).toHaveLength(4);
  });

  it("points an empty roster at the invite link in the header", () => {
    renderTab("students", { roster: [] });
    expect(screen.getByRole("heading", { level: 3, name: "Nobody has joined yet" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to the invite link" })).toHaveAttribute(
      "href",
      "#invite-link",
    );
    expect(document.getElementById("invite-link")).toBe(
      screen.getByRole("textbox", { name: "Invite link" }),
    );
  });

  it("keeps the roster's error on Students", () => {
    renderTab("students", { roster: null });
    expect(screen.getByRole("alert")).toHaveTextContent("The roster could not be loaded.");
  });

  it("puts the assignments and the practice shares on Assignments", () => {
    renderTab("assignments");
    expect(h2s()).toEqual(["Assignments", "Practice"]);
    expect(screen.getByRole("heading", { level: 2, name: "Assignments" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(
      within(screen.getByRole("list", { name: "Assignments" })).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(screen.getByRole("list", { name: "Quizzes shared for practice" })).toHaveTextContent(
      "Cardiac week",
    );
  });

  it("keeps the assignments' error on Assignments", () => {
    renderTab("assignments", { assignments: null });
    expect(screen.getByRole("alert")).toHaveTextContent("The assignments could not be loaded.");
  });

  it("puts the name, the time zone and replacing the link on Settings", () => {
    renderTab("settings");
    expect(h2s()).toEqual(["Rename", "Time zone", "Replace the invite link"]);
    expect(screen.getByRole("textbox", { name: "Class name" })).toHaveValue(
      "NUR 310 Adult Health, Fall",
    );
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("America/Denver");
    expect(screen.getByRole("button", { name: "Replace the link" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Roster" })).not.toBeInTheDocument();
  });

  it("puts each student across the class's live sessions and assignments on Progress", () => {
    renderTab("progress");
    expect(h2s()).toEqual(["Progress"]);
    expect(screen.getByRole("region", { name: "Progress by student" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Students taken off the class" })).toBeVisible();
    // Only what Progress reads: no roster list, no assignments list.
    expect(screen.queryByRole("list", { name: "Roster" })).not.toBeInTheDocument();
  });

  it("keeps the progress's error on Progress", () => {
    renderTab("progress", { progress: null });
    expect(screen.getByRole("alert")).toHaveTextContent("The progress could not be loaded.");
  });

  it("lists the class's live sessions on Live sessions, each opening its report", () => {
    renderTab("sessions");
    expect(h2s()).toEqual(["Live sessions"]);
    const list = screen.getByRole("list", { name: "Live sessions" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/live/00000000-0000-4000-8000-0000000000e3/report",
      "/live/00000000-0000-4000-8000-0000000000e2/report",
      "/live/00000000-0000-4000-8000-0000000000e1/report",
    ]);
    expect(links[0]).toHaveTextContent("Heart failure review");
  });

  it("explains how to run a live session for the class when it has none", () => {
    renderTab("sessions", { sessions: [] });
    expect(
      screen.getByRole("heading", { level: 3, name: "No live sessions for this class yet" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Choose a quiz to start" })).toHaveAttribute(
      "href",
      `/author/classes/${CLASS_PAGE_FIXTURE_CLASS.id}/start`,
    );
  });

  it("keeps the live sessions' error on Live sessions", () => {
    renderTab("sessions", { sessions: null });
    expect(screen.getByRole("alert")).toHaveTextContent("The live sessions could not be loaded.");
  });
});
