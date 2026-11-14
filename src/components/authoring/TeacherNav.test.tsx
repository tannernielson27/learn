import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeaveGuardProvider, useLeaveGuard } from "./LeaveGuard";
import { TeacherNav, revealCurrent } from "./TeacherNav";

let pathname = "/author";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const ID = "00000000-0000-4000-8000-0000000000b1";

/** Every page under the teacher layout, by the path a browser shows for it. */
const TEACHER_PAGES: [pathname: string, current: string | null, how: "page" | "true" | null][] = [
  ["/author", "Library", "page"],
  [`/author/banks/${ID}`, "Library", "true"],
  [`/author/banks/${ID}/new`, "Library", "true"],
  [`/author/banks/${ID}/assign`, "Library", "true"],
  [`/author/items/${ID}`, "Library", "true"],
  [`/author/items/${ID}/play`, "Library", "true"],
  [`/author/case-studies/${ID}`, "Library", "true"],
  [`/author/case-studies/${ID}/assign`, "Library", "true"],
  ["/author/classes", "Classes", "page"],
  [`/author/classes/${ID}`, "Classes", "true"],
  [`/author/assignments/${ID}/report`, "Classes", "true"],
  ["/author/sessions", "Live sessions", "page"],
  ["/author/workspace", "Workspace", "page"],
  ["/author/no-access", null, null],
];

const DESTINATIONS = [
  ["Library", "/author"],
  ["Classes", "/author/classes"],
  ["Live sessions", "/author/sessions"],
  ["Workspace", "/author/workspace"],
] as const;

beforeEach(() => {
  pathname = "/author";
});

describe("TeacherNav", () => {
  it.each(TEACHER_PAGES)("on %s, links to all four places and marks %s", (path, current, how) => {
    pathname = path;
    render(<TeacherNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      DESTINATIONS.map(([label, href]) => [label, href]),
    );
    const marked = links.filter((link) => link.hasAttribute("aria-current"));
    expect(marked.map((link) => link.textContent)).toEqual(current ? [current] : []);
    if (how) expect(marked[0]).toHaveAttribute("aria-current", how);
  });

  it("is tabbed through in reading order, with no link skipped", async () => {
    const user = userEvent.setup();
    render(<TeacherNav />);
    for (const [label] of DESTINATIONS) {
      await user.tab();
      expect(screen.getByRole("link", { name: label })).toHaveFocus();
    }
    expect(document.querySelector("[tabindex]")).toBeNull();
  });

  it("asks a page that holds unsaved work before leaving it", async () => {
    const user = userEvent.setup();
    const guard = vi.fn<(href: string) => boolean>(() => true);
    function Guarded() {
      useLeaveGuard(guard);
      return null;
    }
    render(
      <LeaveGuardProvider>
        <Guarded />
        <TeacherNav />
      </LeaveGuardProvider>,
    );
    await user.click(screen.getByRole("link", { name: "Classes" }));
    expect(guard.mock.calls.map(([href]) => href)).toEqual(["/author/classes"]);
  });
});

/** A row of the given box, scrolled to `scrollLeft`, with its current link at `item`. */
function row(box: { left: number; right: number }, item: { left: number; right: number }) {
  const list = document.createElement("ul");
  list.innerHTML = '<li><a href="/a">A</a></li><li><a href="/b" aria-current="page">B</a></li>';
  Object.defineProperties(list, {
    scrollWidth: { value: 400 },
    clientWidth: { value: box.right - box.left },
  });
  list.scrollLeft = 100;
  list.getBoundingClientRect = () => ({ ...box }) as DOMRect;
  list.querySelector("[aria-current]")!.getBoundingClientRect = () => ({ ...item }) as DOMRect;
  return list;
}

describe("TeacherNav's phone row (#563)", () => {
  it("draws the four links as one row that never wraps", () => {
    render(<TeacherNav />);
    const list = within(screen.getByRole("navigation", { name: "Main" })).getByRole("list");
    expect(list).toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(list).not.toHaveClass("flex-wrap");
  });

  it("marks a fixture's path and names itself apart, for a gallery specimen", () => {
    render(<TeacherNav currentPath="/author/workspace" label="Teacher, phone" />);
    const nav = screen.getByRole("navigation", { name: "Teacher, phone" });
    expect(within(nav).getByRole("link", { name: "Workspace" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("scrolls a current link cut off by the fade into view, and leaves a whole one alone", () => {
    const cut = row({ left: 0, right: 375 }, { left: 300, right: 400 });
    revealCurrent(cut);
    // 400 - (375 - 32): clear of the 32px fade.
    expect(cut.scrollLeft).toBe(157);

    const behind = row({ left: 0, right: 375 }, { left: -40, right: 40 });
    revealCurrent(behind);
    expect(behind.scrollLeft).toBe(60);

    const whole = row({ left: 0, right: 375 }, { left: 100, right: 200 });
    revealCurrent(whole);
    expect(whole.scrollLeft).toBe(100);
  });
});
