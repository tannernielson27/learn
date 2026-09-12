import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const tabs = [
  { id: "notes", label: "Nurses' Notes", content: <p>Notes content</p> },
  { id: "vitals", label: "Vital Signs", content: <p>Vitals content</p> },
  { id: "labs", label: "Lab Results", content: <p>Labs content</p> },
];

describe("Tabs", () => {
  it("shows the first tab and switches on click", async () => {
    render(<Tabs label="Patient record" tabs={tabs} />);
    expect(screen.getByText("Notes content")).toBeVisible();
    expect(screen.getByText("Vitals content")).not.toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Vital Signs" }));
    expect(screen.getByRole("tab", { name: "Vital Signs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Vitals content")).toBeVisible();
  });

  it("moves with arrow keys, wraps, and supports Home/End", async () => {
    const onChange = vi.fn();
    render(<Tabs label="Patient record" tabs={tabs} onChange={onChange} />);
    const first = screen.getByRole("tab", { name: "Nurses' Notes" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Vital Signs" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Lab Results" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Lab Results" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("labs");
  });

  it("works as a controlled component", async () => {
    const onChange = vi.fn();
    render(<Tabs label="Patient record" tabs={tabs} value="labs" onChange={onChange} />);
    expect(screen.getByText("Labs content")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Vital Signs" }));
    expect(onChange).toHaveBeenCalledWith("vitals");
    expect(screen.getByText("Labs content")).toBeVisible();
  });
});

/**
 * jsdom does no layout, so a strip never overflows on its own. These stand in for the one thing
 * the arrows depend on: how much wider the chips are than the strip showing them.
 */
const METRICS = ["scrollWidth", "clientWidth", "scrollLeft"] as const;
let metrics: Record<(typeof METRICS)[number], number>;

describe("Tabs strip arrows", () => {
  beforeEach(() => {
    metrics = { scrollWidth: 0, clientWidth: 0, scrollLeft: 0 };
    for (const prop of METRICS) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get(this: HTMLElement) {
          return this.getAttribute("role") === "tablist" ? metrics[prop] : 0;
        },
      });
    }
    HTMLElement.prototype.scrollBy = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly onResize: () => void) {}
        observe() {
          this.onResize();
        }
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    for (const prop of METRICS) delete proto[prop];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const arrows = (container: HTMLElement) => ({
    start: container.querySelector<HTMLButtonElement>('[data-strip-arrow="start"]'),
    end: container.querySelector<HTMLButtonElement>('[data-strip-arrow="end"]'),
  });

  it("shows no arrows while every chip fits", () => {
    metrics = { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 };
    const { container } = render(<Tabs label="Patient record" tabs={tabs} />);
    expect(arrows(container).start).toBeNull();
    expect(arrows(container).end).toBeNull();
  });

  it("shows both arrows once the chips outrun the strip, spent end greyed out", () => {
    metrics = { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 };
    const { container } = render(<Tabs label="Patient record" tabs={tabs} />);
    const { start, end } = arrows(container);
    // Nothing to the left yet, plenty to the right.
    expect(start).toBeDisabled();
    expect(end).toBeEnabled();
  });

  it("pages by most of a stripful when an arrow is clicked", async () => {
    metrics = { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 };
    const { container } = render(<Tabs label="Patient record" tabs={tabs} />);
    await userEvent.click(arrows(container).end!);
    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith({
      left: 240,
      behavior: "smooth",
    });
  });

  it("keeps the arrows out of the tab order and out of the accessibility tree", () => {
    metrics = { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 };
    const { container } = render(<Tabs label="Patient record" tabs={tabs} />);
    // Arrow keys already move between tabs, so a second way through would only add tab stops.
    for (const arrow of [arrows(container).start, arrows(container).end]) {
      expect(arrow).toHaveAttribute("aria-hidden", "true");
      expect(arrow).toHaveAttribute("tabindex", "-1");
    }
    expect(screen.getAllByRole("tab")).toHaveLength(tabs.length);
  });
});
