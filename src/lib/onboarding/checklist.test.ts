import { describe, expect, it } from "vitest";
import {
  checklistSteps,
  GET_STARTED_COOKIE,
  hiddenFor,
  showChecklist,
  type OrgProgress,
} from "./checklist";

const EMPTY: OrgProgress = { banks: [], hasClass: false, hasAssignmentOrSession: false };
const BANK = { id: "00000000-0000-4000-8000-0000000000b1", name: "Cardiac" };
const SAMPLE = { id: "00000000-0000-4000-8000-0000000000b2", name: "Sample bank" };

const doneOf = (progress: OrgProgress) => checklistSteps(progress).map((step) => step.done);

describe("checklistSteps", () => {
  it("leaves all three steps to do in an empty org", () => {
    const steps = checklistSteps(EMPTY);
    expect(steps.map((step) => step.id)).toEqual(["bank", "class", "assign"]);
    expect(doneOf(EMPTY)).toEqual([false, false, false]);
  });

  it("marks only the bank step done in an org with a bank", () => {
    expect(doneOf({ ...EMPTY, banks: [BANK] })).toEqual([true, false, false]);
  });

  it("marks every step done in an org with a bank, a class and an assignment or session", () => {
    expect(doneOf({ banks: [BANK], hasClass: true, hasAssignmentOrSession: true })).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("offers the sample import while no sample bank exists, and links to it once one does", () => {
    expect(checklistSteps(EMPTY)[0]!.sampleBankId).toBeNull();
    expect(checklistSteps({ ...EMPTY, banks: [BANK] })[0]!.sampleBankId).toBeNull();
    expect(checklistSteps({ ...EMPTY, banks: [BANK, SAMPLE] })[0]!.sampleBankId).toBe(SAMPLE.id);
  });

  // #283: the sample arrives published, so no step tells the author to publish it first.
  it("says the sample is ready to use, and asks for publishing only of the author's own items", () => {
    const [bank, , assign] = checklistSteps({ ...EMPTY, banks: [SAMPLE] });
    expect(bank!.hint).toContain("published, ready to assign or run live");
    expect(bank!.hint).not.toContain("drafts");
    expect(assign!.hint).not.toContain("Only published items are used");
    expect(assign!.hint).toContain("The sample is ready as it is");
  });

  it("links the class step to the classes page", () => {
    expect(checklistSteps(EMPTY)[1]!.href).toBe("/author/classes");
  });

  it("sends the assign step to the most recent bank, and nowhere without one", () => {
    expect(checklistSteps(EMPTY)[2]!.href).toBeNull();
    expect(checklistSteps({ ...EMPTY, banks: [BANK, SAMPLE] })[2]!.href).toBe(
      `/author/banks/${BANK.id}`,
    );
  });

  it("does not change the progress it is given", () => {
    const progress: OrgProgress = { ...EMPTY, banks: [BANK] };
    const before = JSON.stringify(progress);
    checklistSteps(progress);
    expect(JSON.stringify(progress)).toBe(before);
  });
});

describe("showChecklist", () => {
  it("shows while a step is left and it has not been hidden", () => {
    expect(showChecklist(checklistSteps(EMPTY), false)).toBe(true);
  });

  it("stays hidden once hidden", () => {
    expect(showChecklist(checklistSteps(EMPTY), true)).toBe(false);
  });

  it("hides itself once all three steps are done", () => {
    const all = checklistSteps({ banks: [BANK], hasClass: true, hasAssignmentOrSession: true });
    expect(showChecklist(all, false)).toBe(false);
  });
});

describe("hiddenFor", () => {
  const USER = "00000000-0000-4000-8000-0000000000a1";

  it("is hidden only by this account's own cookie value", () => {
    expect(GET_STARTED_COOKIE).toMatch(/^[a-z_]+$/);
    expect(hiddenFor(USER, USER)).toBe(true);
    expect(hiddenFor(undefined, USER)).toBe(false);
    expect(hiddenFor("", USER)).toBe(false);
    expect(hiddenFor("00000000-0000-4000-8000-0000000000a2", USER)).toBe(false);
  });
});
