import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import {
  addTab,
  ehrFormFromStored,
  emptyEhrForm,
  fromEhrForm,
  previewRecord,
  toEhrForm,
  updateBlock,
  type EhrFormValues,
} from "./ehr";
import { parseEhrDraft } from "./ehrDraft";
import {
  describeStepAccess,
  setBlockFromStep,
  setTabStepAccess,
  setTimePointFromStep,
  stepAccessOf,
} from "./ehrSteps";

type Tab = { stepAccess?: unknown; blocks: { fromStep?: unknown }[] };
const tabsOf = (values: EhrFormValues) => (fromEhrForm(values) as { tabs: Tab[] }).tabs;
const pointsOf = (values: EhrFormValues) =>
  (fromEhrForm(values) as { timePoints: { fromStep?: unknown }[] }).timePoints;

const twoTabs = (): EhrFormValues => addTab(addTab(emptyEhrForm(), "nurses_notes"), "lab_results");

describe("a staged patient record survives the form (#336)", () => {
  it("loads and saves a staged record unchanged, through the form and through stored JSON", () => {
    expect(fromEhrForm(toEhrForm(stagedEhr))).toStrictEqual(stagedEhr);
    expect(fromEhrForm(ehrFormFromStored(stagedEhr))).toStrictEqual(stagedEhr);
    // What Save sends is checked by the draft schema first: it must accept the step fields.
    const draft = parseEhrDraft(JSON.parse(JSON.stringify(ehrFormFromStored(stagedEhr))));
    expect(draft.ok).toBe(true);
    if (draft.ok) expect(fromEhrForm(draft.values)).toStrictEqual(stagedEhr);
  });

  it("leaves an unstaged record exactly as it was, with no step keys added", () => {
    const saved = fromEhrForm(ehrFormFromStored(sampleEhr));
    expect(saved).toStrictEqual(sampleEhr);
    expect(JSON.stringify(saved)).not.toMatch(/fromStep|stepAccess/);
  });

  it("the preview reads the step fields too", () => {
    expect(previewRecord(toEhrForm(stagedEhr))).toStrictEqual(ehrRecordSchema.parse(stagedEhr));
  });

  it("drops step values the record cannot hold when it reopens stored JSON", () => {
    const stored = JSON.parse(JSON.stringify(stagedEhr));
    stored.timePoints[2].fromStep = 9;
    stored.tabs[0].blocks[0].fromStep = "3";
    stored.tabs[3].stepAccess = ["open", "locked"];
    stored.tabs[1].stepAccess = ["open", "open", "open", "open", "open", "maybe"];
    const form = ehrFormFromStored(stored);
    expect(form.timePoints[2]).not.toHaveProperty("fromStep");
    expect(form.tabs[0]!.blocks[0]).not.toHaveProperty("fromStep");
    expect(form.tabs[3]).not.toHaveProperty("stepAccess");
    expect(form.tabs[1]).not.toHaveProperty("stepAccess");
  });

  it("reads Step 1 and Open at every step as saying nothing", () => {
    const stored = JSON.parse(JSON.stringify(sampleEhr));
    stored.timePoints[0].fromStep = 1;
    stored.tabs[0].stepAccess = Array(6).fill("open");
    stored.tabs[0].blocks[0].fromStep = 1;
    expect(fromEhrForm(ehrFormFromStored(stored))).toStrictEqual(sampleEhr);
  });

  it("the draft schema refuses step values the record cannot hold", () => {
    const values = toEhrForm(stagedEhr);
    const badPoint = { ...values, timePoints: [{ id: "t1", label: "x", fromStep: 7 }] };
    expect(parseEhrDraft(badPoint).ok).toBe(false);
    const badTab = { ...values, tabs: [{ ...values.tabs[3]!, stepAccess: ["open"] }] };
    expect(parseEhrDraft(badTab).ok).toBe(false);
  });
});

describe("step controls on the form (#336)", () => {
  it("a tab locked at step 2 saves stepAccess with locked second", () => {
    const values = setTabStepAccess(twoTabs(), 1, 2, "locked");
    expect(tabsOf(values)[1]!.stepAccess).toStrictEqual([
      "open",
      "locked",
      "open",
      "open",
      "open",
      "open",
    ]);
    expect(tabsOf(values)[0]).not.toHaveProperty("stepAccess");
  });

  it("a tab set back to Open at every step saves nothing", () => {
    const locked = setTabStepAccess(twoTabs(), 1, 2, "locked");
    const values = setTabStepAccess(locked, 1, 2, "open");
    expect(tabsOf(values)[1]).not.toHaveProperty("stepAccess");
    expect(values.tabs[1]).not.toHaveProperty("stepAccess");
  });

  it("a tab may go open, locked, then open again", () => {
    let values = setTabStepAccess(twoTabs(), 0, 3, "locked");
    values = setTabStepAccess(values, 0, 4, "locked");
    values = setTabStepAccess(values, 0, 1, "hidden");
    expect(tabsOf(values)[0]!.stepAccess).toStrictEqual([
      "hidden",
      "open",
      "locked",
      "locked",
      "open",
      "open",
    ]);
  });

  it("a time point from step 3 saves fromStep 3, and Step 1 saves nothing", () => {
    const values = setTimePointFromStep(emptyEhrForm(), 0, 3);
    expect(pointsOf(values)[0]!.fromStep).toBe(3);
    expect(pointsOf(setTimePointFromStep(values, 0, 1))[0]).not.toHaveProperty("fromStep");
  });

  it("a block from step 3 saves fromStep 3, and Step 1 saves nothing, for every kind", () => {
    let values = twoTabs();
    const vitals = values.tabs[1]!.blocks[0]!;
    values = updateBlock(values, 0, 0, setBlockFromStep(values.tabs[0]!.blocks[0]!, 3));
    values = updateBlock(values, 1, 0, setBlockFromStep(vitals, 4));
    expect(tabsOf(values)[0]!.blocks[0]!.fromStep).toBe(3);
    expect(tabsOf(values)[1]!.blocks[0]!.fromStep).toBe(4);
    const back = setBlockFromStep(values.tabs[0]!.blocks[0]!, 1);
    expect(back).not.toHaveProperty("fromStep");
  });

  it("reads a tab's access at each step, open when it says nothing", () => {
    expect(stepAccessOf(undefined)).toStrictEqual(Array(6).fill("open"));
    expect(stepAccessOf(["hidden", "locked", "open", "open", "open", "open"])[1]).toBe("locked");
  });

  it("describes a tab's access in a few words, grouping runs of steps", () => {
    expect(describeStepAccess(undefined)).toBe("Open at Steps 1–6");
    expect(describeStepAccess(["hidden", "locked", "open", "open", "open", "open"])).toBe(
      "Hidden at Step 1, locked at Step 2, open at Steps 3–6",
    );
    expect(describeStepAccess(["open", "locked", "locked", "open", "hidden", "hidden"])).toBe(
      "Open at Step 1, locked at Steps 2–3, open at Step 4, hidden at Steps 5–6",
    );
  });
});
