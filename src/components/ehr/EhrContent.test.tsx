import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { EhrContent, tabLabels } from "./EhrContent";

function Harness({ record = sampleEhr }: { record?: EhrRecord }) {
  const [selectedTabId, setSelectedTabId] = useState(record.tabs[0]!.id);
  return (
    <EhrContent record={record} selectedTabId={selectedTabId} onSelectTab={setSelectedTabId} />
  );
}

const singleTimePoint: EhrRecord = {
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

describe("EhrContent", () => {
  it("heads the record with the client's age, sex and setting", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "74-year-old female" })).toBeInTheDocument();
    expect(screen.getByText(/Orthopedic unit/)).toBeInTheDocument();
    expect(screen.getByText(/Admitted Day 0/)).toBeInTheDocument();
  });

  it("heads a named client with the name, and keeps age and sex in the meta line", () => {
    const named: EhrRecord = {
      ...sampleEhr,
      patientHeader: { ...sampleEhr.patientHeader, name: "R. Alvarez" },
    };
    render(<Harness record={named} />);
    expect(screen.getByRole("heading", { name: "R. Alvarez" })).toBeInTheDocument();
    expect(screen.getByText(/74-year-old female · Orthopedic unit/)).toBeInTheDocument();
  });

  it("names a tab by its time point when the record has more than one", () => {
    expect(tabLabels(sampleEhr).tab_notes_0800).toBe("Nurses' Notes · Day 1, 0800");
    expect(tabLabels(sampleEhr).tab_notes_1400).toBe("Nurses' Notes · Day 1, 1400");
    // A tab with no time point keeps its plain title.
    expect(tabLabels(sampleEhr).tab_hp).toBe("History & Physical");
    // A single-time-point record gains nothing from the suffix.
    expect(tabLabels(singleTimePoint).tab_a).toBe("Nurses' Notes");
  });

  it("is a tablist whose panel is labelled by its tab", async () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "Patient record sections" });
    expect(within(list).getAllByRole("tab")).toHaveLength(sampleEhr.tabs.length);
    const panel = screen.getByRole("tabpanel", { name: "History & Physical" });
    expect(within(panel).getByText(/total hip arthroplasty/)).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys and jumps with Home and End", async () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "History & Physical" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Nurses' Notes · Day 1, 0800" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Orders" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Orders" })).toBeInTheDocument();
    await userEvent.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("shows the selected tab's blocks and hides the rest", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Lab Results · Day 1, 1400" }));
    const panel = screen.getByRole("tabpanel", { name: "Lab Results · Day 1, 1400" });
    expect(within(panel).getByRole("rowheader", { name: "D-dimer" })).toBeInTheDocument();
    expect(screen.queryByText(/total hip arthroplasty/)).not.toBeVisible();
  });
});
