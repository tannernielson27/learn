import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { sampleTrendEhr } from "@/lib/ngn/fixtures/trend";
import { DRAFT_ERROR } from "./draft";
import { emptyEhrForm, toEhrForm } from "./ehr";
import { parseEhrDraft } from "./ehrDraft";

describe("parseEhrDraft", () => {
  it("accepts the sample records and an empty one", () => {
    for (const values of [toEhrForm(sampleEhr), toEhrForm(sampleTrendEhr), emptyEhrForm()]) {
      expect(parseEhrDraft(values)).toStrictEqual({ ok: true, values });
    }
  });

  it("refuses fields the form does not have", () => {
    const values = { ...toEhrForm(sampleEhr), extra: true };
    expect(parseEhrDraft(values)).toStrictEqual({ ok: false, error: DRAFT_ERROR });
    const tab = { ...toEhrForm(sampleEhr).tabs[0]!, script: "x" };
    expect(parseEhrDraft({ ...toEhrForm(sampleEhr), tabs: [tab] }).ok).toBe(false);
  });

  it("refuses a block kind or flag the record cannot hold", () => {
    const values = toEhrForm(sampleTrendEhr);
    const badBlock = {
      ...values,
      tabs: [{ ...values.tabs[0]!, blocks: [{ kind: "html", value: "<b>" }] }],
    };
    expect(parseEhrDraft(badBlock).ok).toBe(false);
    const badFlag = {
      ...values,
      tabs: [
        {
          ...values.tabs[0]!,
          blocks: [{ kind: "vitals", rows: [{ label: "HR", value: "1", unit: "", flag: "X" }] }],
        },
      ],
    };
    expect(parseEhrDraft(badFlag).ok).toBe(false);
  });

  it("refuses more sections, time points or table cells than a record needs", () => {
    const values = toEhrForm(sampleTrendEhr);
    const tab = values.tabs[0]!;
    expect(parseEhrDraft({ ...values, tabs: Array.from({ length: 41 }, () => tab) }).ok).toBe(
      false,
    );
    const point = values.timePoints[0]!;
    expect(
      parseEhrDraft({ ...values, timePoints: Array.from({ length: 13 }, () => point) }).ok,
    ).toBe(false);
    const wide = {
      kind: "table",
      columns: Array.from({ length: 13 }, () => "c"),
      rows: [Array.from({ length: 13 }, () => "v")],
    };
    expect(parseEhrDraft({ ...values, tabs: [{ ...tab, blocks: [wide] }] }).ok).toBe(false);
  });

  it("refuses text longer than a chart note needs", () => {
    const values = toEhrForm(sampleEhr);
    const long = { ...values, patient: { ...values.patient, setting: "x".repeat(201) } };
    expect(parseEhrDraft(long).ok).toBe(false);
  });
});
