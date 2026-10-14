import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ehrFormFromStored,
  fromEhrForm,
  toEhrForm,
  type EhrFormValues,
} from "@/lib/authoring/forms/ehr";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import type { SaveResult } from "./EditorShell";
import { EhrEditor } from "./EhrEditor";

/**
 * #336: the case study's patient record editor sets when each tab, time point and block shows,
 * and previews the patient record at any step as a student at that step sees it.
 */

function setup(initialValues: EhrFormValues) {
  const onSave = vi.fn<(values: EhrFormValues) => Promise<SaveResult>>(async () => ({ ok: true }));
  render(<EhrEditor initialValues={initialValues} onSave={onSave} />);
  const user = userEvent.setup({ delay: null });
  const saved = async () => {
    await user.click(screen.getByRole("button", { name: "Save patient record" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    return fromEhrForm(onSave.mock.calls[0]![0]) as {
      timePoints: Record<string, unknown>[];
      tabs: (Record<string, unknown> & { blocks: Record<string, unknown>[] })[];
    };
  };
  return { user, saved };
}

const select = (name: string) =>
  screen.getByLabelText(name, { selector: "select" }) as HTMLSelectElement;
const preview = () => within(screen.getByLabelText("Preview"));

// The sample record's first two tabs (History & Physical, Nurses' Notes) are plenty here.
const twoTabs = (): EhrFormValues => {
  const form = toEhrForm(sampleEhr);
  return { ...form, tabs: form.tabs.slice(0, 2) };
};

describe("step controls in the case study's patient record editor (#336)", () => {
  it("a tab set to Locked at Step 2 saves stepAccess with locked second", async () => {
    const { user, saved } = setup(twoTabs());
    await user.selectOptions(select("Nurses' Notes, Step 2"), "locked");
    const record = await saved();
    expect(record.tabs[1]!.stepAccess).toStrictEqual([
      "open",
      "locked",
      "open",
      "open",
      "open",
      "open",
    ]);
    expect(record.tabs[0]).not.toHaveProperty("stepAccess");
  }, 30_000);

  it("a tab Open at every step saves nothing", async () => {
    const { user, saved } = setup(twoTabs());
    await user.selectOptions(select("Nurses' Notes, Step 2"), "locked");
    await user.selectOptions(select("Nurses' Notes, Step 2"), "open");
    const record = await saved();
    expect(record.tabs[1]).not.toHaveProperty("stepAccess");
    expect(JSON.stringify(record)).not.toMatch(/stepAccess|fromStep/);
  }, 30_000);

  it("a tab that goes open, locked, then open again saves exactly that", async () => {
    const { user, saved } = setup(twoTabs());
    await user.selectOptions(select("History & Physical, Step 3"), "locked");
    await user.selectOptions(select("History & Physical, Step 4"), "locked");
    const record = await saved();
    expect(record.tabs[0]!.stepAccess).toStrictEqual([
      "open",
      "open",
      "locked",
      "locked",
      "open",
      "open",
    ]);
  }, 30_000);

  it("says a tab's steps in words on its row, without opening it", async () => {
    const { user } = setup(twoTabs());
    expect(screen.getAllByText("Open at Steps 1–6", { selector: "summary *" })).toHaveLength(2);
    await user.selectOptions(select("Nurses' Notes, Step 1"), "hidden");
    await user.selectOptions(select("Nurses' Notes, Step 2"), "locked");
    expect(
      screen.getByText("Hidden at Step 1, locked at Step 2, open at Steps 3–6", {
        selector: "summary *",
      }),
    ).toBeInTheDocument();
  }, 30_000);

  it("a note shown from Step 3 saves fromStep 3, and Step 1 saves nothing", async () => {
    const { user, saved } = setup(twoTabs());
    // The nurses' notes tab's first block is its 0800 note.
    await user.selectOptions(select("Tab 2, block 1, Shows from"), "3");
    await user.selectOptions(select("Time point 1, Shows from"), "1");
    const record = await saved();
    expect(record.tabs[1]!.blocks[0]!.fromStep).toBe(3);
    expect(record.timePoints[0]).not.toHaveProperty("fromStep");
    expect(record.tabs[0]!.blocks[0]).not.toHaveProperty("fromStep");
  }, 30_000);

  it("a time point set back to Step 1 saves nothing", async () => {
    const form = toEhrForm(stagedEhr);
    const { user, saved } = setup({ ...form, tabs: form.tabs.slice(0, 1) });
    expect(select("Time point 3, Shows from")).toHaveValue("3");
    await user.selectOptions(select("Time point 3, Shows from"), "1");
    const record = await saved();
    expect(record.timePoints[2]).not.toHaveProperty("fromStep");
    expect(record.timePoints[3]!.fromStep).toBe(4);
  }, 30_000);

  it("saves a staged record it was given unchanged: no step field is dropped", async () => {
    const { saved } = setup(ehrFormFromStored(stagedEhr));
    expect(await saved()).toStrictEqual(stagedEhr);
  }, 30_000);

  it("previews the patient record at a step as a student at that step sees it", async () => {
    const form = toEhrForm(stagedEhr);
    const { user } = setup({ ...form, tabs: form.tabs.slice(0, 4) });
    // The whole patient record first, as before.
    expect(select("Preview at")).toHaveValue("");
    expect(preview().getByRole("radio", { name: "0400" })).toBeInTheDocument();

    await user.selectOptions(select("Preview at"), "2");
    expect(preview().queryByRole("radio", { name: "0130" })).not.toBeInTheDocument();
    const labs = preview().getByRole("tab", { name: /Lab Results/ });
    expect(labs).toHaveAttribute("aria-disabled", "true");
    expect(labs).toHaveTextContent("Locked");

    await user.selectOptions(select("Preview at"), "3");
    expect(preview().getByRole("radio", { name: "0130" })).toBeInTheDocument();
    expect(preview().getByRole("tab", { name: "Lab Results" })).not.toHaveAttribute(
      "aria-disabled",
    );
  }, 30_000);

  it("says when no time point shows from Step 1, and takes the author to it", async () => {
    const form = twoTabs();
    const { user } = setup({ ...form, timePoints: form.timePoints.slice(0, 1) });
    await user.selectOptions(select("Time point 1, Shows from"), "2");
    const problem = within(screen.getByLabelText("Problems to fix")).getByRole("button", {
      name: "One time point must show from Step 1. Set time point 1 to Step 1.",
    });
    await user.click(problem);
    expect(select("Time point 1, Shows from")).toHaveFocus();
  }, 30_000);

  it("says when students would see no tab at a step, and takes the author to it", async () => {
    const form = twoTabs();
    const { user } = setup({ ...form, tabs: form.tabs.slice(0, 1) });
    await user.selectOptions(select("History & Physical, Step 2"), "hidden");
    const problem = within(screen.getByLabelText("Problems to fix")).getByRole("button", {
      name: "At Step 2, students see no tab.",
    });
    await user.click(problem);
    expect(select("History & Physical, Step 2")).toHaveFocus();
  }, 30_000);
});
