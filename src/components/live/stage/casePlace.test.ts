import { describe, expect, it } from "vitest";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { casePlace, patientLine } from "./casePlace";

describe("patientLine", () => {
  it("says who the client is and where, as the record's own header does", () => {
    expect(patientLine(stagedEhr.patientHeader)).toBe("29-year-old female · Emergency department");
  });

  it("leads with the name when the record has one", () => {
    expect(patientLine({ ...stagedEhr.patientHeader, name: "Client A" })).toBe(
      "Client A · 29-year-old female · Emergency department",
    );
  });
});

describe("casePlace", () => {
  it("names nothing new on the first step: the whole record is new", () => {
    const place = casePlace(stagedEhr, 1);
    expect(place.newTabs).toEqual([]);
    expect(place.time).toBe("0115");
  });

  it("names the tabs that opened or grew at this step, and the latest time charted", () => {
    const place = casePlace(stagedEhr, 3);
    expect(place.newTabs).toContain("Lab Results");
    expect(place.newTabs).toContain("Nurses' Notes");
    expect(place.newTabs).not.toContain("History & Physical");
    expect(place.time).toBe("0130");
  });

  it("reads a record with nothing held back as having nothing new", () => {
    const flat: EhrRecord = {
      ...stagedEhr,
      timePoints: [{ id: "t1", label: "0800" }],
      tabs: [stagedEhr.tabs[0] as EhrRecord["tabs"][number]],
    };
    expect(casePlace(flat, 4)).toMatchObject({ newTabs: [], time: "0800" });
  });

  it("clamps a position past the sixth step to the sixth", () => {
    expect(casePlace(stagedEhr, 9).time).toBe("0400");
  });
});
