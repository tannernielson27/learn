import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyEhrForm, toEhrForm, type EhrFormValues } from "@/lib/authoring/forms/ehr";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { sampleTrendEhr } from "@/lib/ngn/fixtures/trend";
import type { SaveResult } from "./EditorShell";
import { EhrEditor } from "./EhrEditor";

function setup(
  initialValues: EhrFormValues = emptyEhrForm(),
  save: (values: EhrFormValues) => Promise<SaveResult> = async () => ({ ok: true }),
) {
  const onSave = vi.fn<(values: EhrFormValues) => Promise<SaveResult>>(save);
  render(<EhrEditor initialValues={initialValues} onSave={onSave} />);
  return { onSave, user: userEvent.setup({ delay: null }) };
}

// A whole record is hundreds of fields, and role queries compute every element's accessible name
// on each call, which times out under a loaded run. Fields are found by label and buttons by text
// here; the table test below and the e2e journey check the accessible names themselves.
const preview = () => screen.getByLabelText("Preview");
const problems = () => screen.queryByLabelText("Problems to fix");
const textbox = (name: string) =>
  screen.getByLabelText(name, { selector: "input, textarea" }) as HTMLInputElement;
const select = (name: string) =>
  screen.getByLabelText(name, { selector: "select" }) as HTMLSelectElement;
const button = (name: string) => {
  const found = Array.from(document.querySelectorAll("button")).filter(
    (element) => element.textContent?.replace(/\s+/g, " ").trim() === name,
  );
  if (found.length !== 1) throw new Error(`Expected one "${name}" button, found ${found.length}`);
  return found[0]!;
};

describe("EhrEditor", () => {
  it("warns that every record is fictional", () => {
    setup();
    expect(screen.getByText(/fictional/i)).toHaveTextContent(/never enter real patient/i);
  });

  it("writes a header, an H&P and vital signs at two times, and previews them at either time", async () => {
    const { user } = setup();
    expect(within(preview()).getByText(/the preview appears once/i)).toBeInTheDocument();

    await user.type(textbox("Age in years"), "68");
    await user.selectOptions(select("Sex"), "male");
    await user.type(textbox("Care setting"), "Medical unit");

    await user.clear(textbox("Time point 1, Label"));
    await user.type(textbox("Time point 1, Label"), "0800");
    await user.click(button("Add time point"));
    await user.type(textbox("Time point 2, Label"), "1200");

    await user.selectOptions(select("New section kind"), "history_physical");
    await user.click(button("Add section"));
    await user.type(textbox("Section 1, block 1, Text"), "Admitted with pneumonia.");

    for (const [section, time, rate, flag] of [
      [2, "t1", "88", ""],
      [3, "t2", "118", "H"],
    ] as const) {
      await user.selectOptions(select("New section kind"), "vital_signs");
      await user.click(button("Add section"));
      await user.selectOptions(select(`Section ${section}, Time`), time);
      const row = `Section ${section}, block 1, row 1`;
      await user.type(textbox(`${row}, Measure`), "Heart rate");
      await user.type(textbox(`${row}, Value`), rate);
      await user.type(textbox(`${row}, Unit`), "beats/min");
      await user.selectOptions(select(`${row}, Flag`), flag);
    }

    expect(problems()).not.toBeInTheDocument();
    const record = within(preview());
    expect(record.getByRole("heading", { name: "68-year-old male" })).toBeInTheDocument();
    expect(record.getByRole("radio", { name: "0800" })).toBeChecked();
    await user.click(record.getByRole("tab", { name: "Vital Signs" }));
    expect(record.getByText("88")).toBeInTheDocument();

    // A new time keeps the reader on the same section, as the player does.
    await user.click(record.getByRole("radio", { name: "1200" }));
    expect(record.getByRole("tab", { name: "Vital Signs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(record.getByText("118")).toBeInTheDocument();
    expect(record.getByText("high")).toBeInTheDocument();
  }, 30_000);

  it("removing a time point clears it from every section charted then", async () => {
    // The first four sections are enough, and render in a fraction of the time under coverage.
    const { user } = setup({
      ...toEhrForm(sampleTrendEhr),
      tabs: toEhrForm(sampleTrendEhr).tabs.slice(0, 4),
    });
    // Section 4 is the 1600 nurses' note.
    expect(select("Section 4, Time")).toHaveValue("tp_1600");
    await user.click(button("Remove time point 3"));
    expect(select("Section 4, Time")).toHaveValue("");
    expect(screen.queryByLabelText("Time point 3, Label")).not.toBeInTheDocument();
    expect(problems()).not.toBeInTheDocument();
  }, 30_000);

  it("grows and shrinks a table with named row and column buttons", async () => {
    const { user } = setup();
    const named = (name: string) => screen.getByRole("button", { name });
    const field = (name: string) => screen.getByRole("textbox", { name });
    const gone = (name: string) =>
      expect(screen.queryByRole("textbox", { name })).not.toBeInTheDocument();

    await user.click(named("Add section"));
    await user.click(named("Add table to section 1"));
    const block = "Section 1, block 2";
    expect(field(`${block}, Column 1 heading`)).toBeInTheDocument();
    expect(field(`${block}, Row 1, column 2`)).toBeInTheDocument();

    await user.click(named("Add column to section 1, block 2"));
    expect(field(`${block}, Column 3 heading`)).toBeInTheDocument();
    expect(field(`${block}, Row 1, column 3`)).toBeInTheDocument();
    await user.click(named("Add row to section 1, block 2"));
    expect(field(`${block}, Row 2, column 3`)).toBeInTheDocument();

    await user.click(named("Remove column 3 from section 1, block 2"));
    gone(`${block}, Row 2, column 3`);
    await user.click(named("Remove row 2 from section 1, block 2"));
    gone(`${block}, Row 2, column 1`);

    await user.click(named("Remove block 2 from section 1"));
    gone(`${block}, Column 1 heading`);
  }, 30_000);

  it("after a removal, focus moves to the matching Add control instead of the page", async () => {
    const { user } = setup();
    await user.click(button("Add time point"));
    await user.click(button("Remove time point 2"));
    expect(button("Add time point")).toHaveFocus();

    await user.click(button("Add section"));
    await user.click(button("Add table to section 1"));
    await user.click(button("Add row to section 1, block 2"));
    await user.click(button("Remove row 2 from section 1, block 2"));
    expect(button("Add row to section 1, block 2")).toHaveFocus();
    await user.click(button("Add column to section 1, block 2"));
    await user.click(button("Remove column 3 from section 1, block 2"));
    expect(button("Add column to section 1, block 2")).toHaveFocus();

    await user.click(button("Add vitals to section 1"));
    await user.click(button("Add measure to section 1, block 3"));
    await user.click(button("Remove measure 2 from section 1, block 3"));
    expect(button("Add measure to section 1, block 3")).toHaveFocus();

    await user.click(button("Remove block 3 from section 1"));
    expect(button("Add text to section 1")).toHaveFocus();

    await user.click(button("Remove section 1"));
    expect(select("New section kind")).toHaveFocus();
  }, 30_000);

  it("lists problems in plain words, and a problem takes the author to its field", async () => {
    const { user } = setup();
    const list = within(problems()!);
    await user.click(
      list.getByRole("button", {
        name: "Enter the patient's age in whole years, from 0 to 120.",
      }),
    );
    expect(textbox("Age in years")).toHaveFocus();
    expect(textbox("Age in years")).toHaveAttribute("aria-invalid", "true");
    expect(
      list.getByRole("button", { name: "Add at least one section to the record." }),
    ).toBeInTheDocument();
  });

  it("moves a section, keeping focus on its move buttons", async () => {
    // The first four sections are enough, and render in a fraction of the time under coverage.
    const { user } = setup({
      ...toEhrForm(sampleTrendEhr),
      tabs: toEhrForm(sampleTrendEhr).tabs.slice(0, 4),
    });
    await user.click(button("Move section 2 up"));
    expect(textbox("Section 1, Title")).toHaveValue("Nurses' Notes");
    expect(textbox("Section 2, Title")).toHaveValue("History & Physical");
    // At the top there is no Move up, so focus goes to the same section's other button.
    expect(button("Move section 1 down")).toHaveFocus();
  }, 30_000);

  it("saves the form, and tracks changes made since the last save", async () => {
    const { onSave, user } = setup(toEhrForm(sampleEhr));
    expect(within(preview()).getByRole("heading", { name: "74-year-old female" })).toBeVisible();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    await user.type(textbox("Care setting"), " B");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(button("Save record"));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].patient.setting).toBe("Orthopedic unit B");
    // The record's time selector has its own status region, so find the message by its text.
    expect(await screen.findByText("Record saved.")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  }, 30_000);

  it("says why a save failed", async () => {
    const { user } = setup(toEhrForm(sampleEhr), async () => ({
      ok: false,
      error: "This case study is gone.",
    }));
    await user.click(button("Save record"));
    expect(await screen.findByText("This case study is gone.")).toHaveAttribute("role", "alert");
  }, 30_000);

  it("recovers from a save request that fails outright", async () => {
    const { user } = setup(toEhrForm(sampleEhr), async () => {
      throw new Error("offline");
    });
    await user.click(button("Save record"));
    expect(await screen.findByText("The record could not be saved. Try again.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(button("Save record")).not.toBeDisabled();
  }, 30_000);
});
