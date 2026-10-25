import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ClassTab } from "@/lib/classes/classTabs";
import { ClassTabPanel, requestClassTabFocus } from "./ClassTabPanel";
import { ClassTabs } from "./ClassTabs";

const CLASS = "00000000-0000-4000-8000-00000000c1a5";

function panel(tab: ClassTab, heading: string) {
  return (
    <ClassTabPanel tab={tab}>
      <section>
        <h2>{heading}</h2>
        <button type="button">Something in it</button>
      </section>
    </ClassTabPanel>
  );
}

describe("ClassTabPanel", () => {
  it("leaves focus alone when the page is opened from its address", () => {
    render(panel("students", "Roster"));
    expect(document.body).toHaveFocus();
  });

  it("moves focus to the new panel's heading after a tab link is followed", () => {
    const { rerender } = render(panel("overview", "At a glance"));
    requestClassTabFocus("settings");
    rerender(panel("settings", "Rename"));
    const heading = screen.getByRole("heading", { level: 2, name: "Rename" });
    expect(heading).toHaveFocus();
    // Focusable from script only, so it is not a stop for Tab.
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("also does so when the new panel is drawn fresh rather than updated", () => {
    requestClassTabFocus("students");
    render(panel("students", "Roster"));
    expect(screen.getByRole("heading", { name: "Roster" })).toHaveFocus();
  });

  it("asks only once: the same panel drawn again later leaves focus alone", () => {
    requestClassTabFocus("students");
    const first = render(panel("students", "Roster"));
    first.unmount();
    render(panel("students", "Roster"));
    expect(document.body).toHaveFocus();
  });

  it("ignores a request for another tab", () => {
    requestClassTabFocus("assignments");
    render(panel("students", "Roster"));
    expect(document.body).toHaveFocus();
    // The request still stands for its own tab, which spends it.
    render(panel("assignments", "Assignments"));
    expect(screen.getByRole("heading", { name: "Assignments" })).toHaveFocus();
  });
});

describe("ClassTabs asking the panel for focus", () => {
  it("asks when another tab's link is followed", async () => {
    const user = userEvent.setup();
    render(<ClassTabs classId={CLASS} current="overview" />);
    // jsdom does not navigate; only the link's own click handler matters here.
    const link = screen.getByRole("link", { name: "Students" });
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    render(panel("students", "Roster"));
    expect(screen.getByRole("heading", { name: "Roster" })).toHaveFocus();
  });

  it("does not ask for the tab already open", async () => {
    const user = userEvent.setup();
    render(<ClassTabs classId={CLASS} current="students" />);
    const link = screen.getByRole("link", { name: "Students" });
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    render(panel("students", "Roster"));
    expect(screen.getByRole("heading", { name: "Roster" })).not.toHaveFocus();
    expect(link).toHaveFocus();
  });
});
