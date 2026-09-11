import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EhrBlock } from "@/lib/ngn/schemas";
import { EhrBlocks } from "./blocks";

const note = (value: string): EhrBlock => ({ kind: "markdown", value });

describe("EHR markdown blocks", () => {
  it("splits a note into paragraphs in the reading face", () => {
    render(<EhrBlocks blocks={[note("First paragraph.\n\nSecond paragraph.")]} />);
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    const second = screen.getByText("Second paragraph.");
    expect(second).toBeInTheDocument();
    expect(second.closest(".ehr-note")).not.toBeNull();
  });

  it("renders a leading clock time as a timestamp rather than prose", () => {
    render(<EhrBlocks blocks={[note("1400: Client reports sudden shortness of breath.")]} />);
    const stamp = screen.getByText("1400");
    expect(stamp).toHaveClass("ehr-time");
    expect(screen.getByText(/Client reports sudden shortness of breath\./)).toBeInTheDocument();
  });

  it("renders a dash list as a real list", () => {
    render(<EhrBlocks blocks={[note("- Enoxaparin 40 mg\n- Oxycodone 5 mg")]} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Enoxaparin 40 mg", "Oxycodone 5 mg"]);
  });
});

describe("EHR table blocks", () => {
  const table: EhrBlock = {
    kind: "table",
    columns: ["", "Day 1, 0800", "Day 1, 1400"],
    rows: [
      ["Temperature", "37.1 °C", "37.4 °C"],
      ["Heart rate", "82", "118"],
    ],
  };

  it("makes the first cell of each row a row header and leaves the corner cell blank", () => {
    render(<EhrBlocks blocks={[table]} />);
    const grid = screen.getByRole("table");
    // The empty corner heading is a plain cell: an empty th fails the axe empty-table-header rule.
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Day 1, 0800", "Day 1, 1400"]);
    expect(within(grid).getByRole("rowheader", { name: "Heart rate" })).toBeInTheDocument();
  });

  it("sets numbers in tabular figures so columns line up", () => {
    render(<EhrBlocks blocks={[table]} />);
    expect(screen.getByRole("table")).toHaveClass("tabular");
  });
});

describe("EHR vitals blocks", () => {
  const vitals: EhrBlock = {
    kind: "vitals",
    rows: [
      { label: "Hemoglobin", value: "10.2", unit: "g/dL", flag: "L" },
      { label: "Platelets", value: "212", unit: "K/µL" },
      { label: "D-dimer", value: "3.8", unit: "µg/mL FEU", flag: "H" },
    ],
  };

  it("lists each value with its unit against a row header", () => {
    render(<EhrBlocks blocks={[vitals]} />);
    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("rowheader", { name: "Platelets" })).toBeInTheDocument();
    expect(within(grid).getByText("212")).toBeInTheDocument();
    expect(within(grid).getByText("K/µL")).toBeInTheDocument();
    expect(grid).toHaveClass("tabular");
  });

  it("marks abnormal values with an H or L tag that is also announced", () => {
    render(<EhrBlocks blocks={[vitals]} />);
    const rows = screen.getAllByRole("row");
    const hgb = rows.find((row) => within(row).queryByText("Hemoglobin"));
    const platelets = rows.find((row) => within(row).queryByText("Platelets"));
    expect(within(hgb!).getByText("L")).toBeInTheDocument();
    // Colour alone never carries the signal: the tag has text for screen readers too.
    expect(within(hgb!).getByText("low")).toBeInTheDocument();
    expect(within(platelets!).queryByText(/^(high|low)$/)).toBeNull();
  });
});
