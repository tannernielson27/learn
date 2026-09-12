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
});
