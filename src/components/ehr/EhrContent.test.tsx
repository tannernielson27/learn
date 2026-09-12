import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { EhrContent, tabsAtTime } from "./EhrContent";

function Harness({ record = sampleEhr }: { record?: EhrRecord }) {
  const [selectedTimeId, setSelectedTimeId] = useState(record.timePoints[0]!.id);
  const [selectedTabId, setSelectedTabId] = useState(
    tabsAtTime(record, record.timePoints[0]!.id)[0]!.id,
  );
  return (
    <EhrContent
      record={record}
      selectedTabId={selectedTabId}
      onSelectTab={setSelectedTabId}
      selectedTimeId={selectedTimeId}
      onSelectTime={(id) => {
        setSelectedTimeId(id);
        const first = tabsAtTime(record, id)[0];
        if (first && !tabsAtTime(record, id).some((t) => t.id === selectedTabId)) {
          setSelectedTabId(first.id);
        }
      }}
    />
  );
}

const oneTime: EhrRecord = {
  ...sampleEhr,
  timePoints: [{ id: "tp_only", label: "Day 1" }],
  tabs: [
    {
      id: "tab_a",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      timePointId: "tp_only",
      blocks: [{ kind: "markdown", value: "0800: Alert." }],
    },
  ],
};

describe("tabsAtTime", () => {
  it("keeps untimed tabs whatever the time", () => {
    const ids = tabsAtTime(sampleEhr, "tp_0800").map((t) => t.id);
    expect(ids).toContain("tab_hp");
    expect(ids).toContain("tab_vitals");
    expect(ids).toContain("tab_orders");
  });

  it("shows the one variant of a repeated section that belongs to the chosen time", () => {
    expect(tabsAtTime(sampleEhr, "tp_0800").map((t) => t.id)).toContain("tab_notes_0800");
    expect(tabsAtTime(sampleEhr, "tp_0800").map((t) => t.id)).not.toContain("tab_notes_1400");
    expect(tabsAtTime(sampleEhr, "tp_1400").map((t) => t.id)).toContain("tab_notes_1400");
  });

  it("leaves out a section that was not charted at the chosen time", () => {
    // Labs were drawn at 1400 only, so at 0800 there is no lab tab to open.
    expect(tabsAtTime(sampleEhr, "tp_0800").map((t) => t.id)).not.toContain("tab_labs");
    expect(tabsAtTime(sampleEhr, "tp_1400").map((t) => t.id)).toContain("tab_labs");
  });

  it("keeps a section with no time on it, even where a timed one shares its name", () => {
    // An author converting a record to a trend can easily leave one variant untagged; it must
    // not disappear from every time as a result.
    const mixed: EhrRecord = {
      ...sampleEhr,
      tabs: [
        { ...sampleEhr.tabs[1]!, id: "tab_notes_any", timePointId: undefined },
        ...sampleEhr.tabs,
      ],
    };
    expect(tabsAtTime(mixed, "tp_0800").map((t) => t.id)).toContain("tab_notes_any");
    expect(tabsAtTime(mixed, "tp_1400").map((t) => t.id)).toContain("tab_notes_any");
  });

  it("keeps the record's own tab order", () => {
    expect(tabsAtTime(sampleEhr, "tp_1400").map((t) => t.id)).toEqual([
      "tab_hp",
      "tab_notes_1400",
      "tab_vitals",
      "tab_labs",
      "tab_orders",
    ]);
  });
});

describe("EhrContent", () => {
  it("heads the record with the client's age, sex and setting", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "74-year-old female" })).toBeInTheDocument();
    expect(screen.getByText(/Orthopedic unit/)).toBeInTheDocument();
    expect(screen.getByText(/Admitted Day 0/)).toBeInTheDocument();
  });

  it("is a tablist whose panel is labelled by its tab", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "Patient record sections" });
    expect(within(list).getAllByRole("tab")).toHaveLength(4);
    const panel = screen.getByRole("tabpanel", { name: "History & Physical" });
    expect(within(panel).getByText(/total hip arthroplasty/)).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys and jumps with Home and End", async () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "History & Physical" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Nurses' Notes" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Orders" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("offers a time selector only when the record is charted more than once", () => {
    render(<Harness record={oneTime} />);
    expect(screen.queryByRole("radiogroup", { name: "Time" })).toBeNull();
    render(<Harness />);
    const times = screen.getByRole("radiogroup", { name: "Time" });
    expect(
      within(times)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Day 1, 0800", "Day 1, 1400"]);
  });

  it("swaps the charted sections when the time changes, and says which time is showing", async () => {
    render(<Harness />);
    expect(screen.getByText(/Alert and oriented/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Lab Results" })).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Day 1, 1400" }));
    expect(screen.getByRole("tab", { name: "Lab Results" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Nurses' Notes" }));
    expect(screen.getByText(/sudden shortness of breath/)).toBeInTheDocument();
    // Untimed sections are unmoved by the change.
    expect(screen.getByRole("tab", { name: "Vital Signs" })).toBeInTheDocument();
  });

  it("announces the chosen time politely", async () => {
    render(<Harness />);
    const announcement = screen.getByRole("status");
    expect(announcement).toHaveTextContent("Day 1, 0800");
    await userEvent.click(screen.getByRole("radio", { name: "Day 1, 1400" }));
    expect(announcement).toHaveTextContent("Day 1, 1400");
  });

  it("opens the first charted section when the one it is given is not there", () => {
    render(
      <EhrContent
        record={sampleEhr}
        selectedTabId="tab_labs"
        onSelectTab={() => {}}
        selectedTimeId="tp_0800"
        onSelectTime={() => {}}
      />,
    );
    // Labs were not drawn at 0800. Something must still be open, and reachable by keyboard.
    const selected = screen.getByRole("tab", { selected: true });
    expect(selected).toHaveAccessibleName("History & Physical");
    expect(selected).toHaveAttribute("tabindex", "0");
  });

  it("says so rather than going blank when nothing was charted at a time", () => {
    const nothingYet: EhrRecord = {
      ...sampleEhr,
      timePoints: [...sampleEhr.timePoints, { id: "tp_2200", label: "Day 1, 2200" }],
      // Every section is charted at a time, and none of them at 2200.
      tabs: sampleEhr.tabs.filter((tab) => tab.timePointId !== undefined),
    };
    render(
      <EhrContent
        record={nothingYet}
        selectedTabId="tab_notes_0800"
        onSelectTab={() => {}}
        selectedTimeId="tp_2200"
        onSelectTime={() => {}}
      />,
    );
    expect(screen.getByText(/Nothing was charted/)).toBeInTheDocument();
  });
});
