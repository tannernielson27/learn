import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyBowtieForm, toBowtieForm, type BowtieFormValues } from "@/lib/authoring/forms/bowtie";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { bowtieItemSchema } from "@/lib/ngn/schemas";
import { BowtieEditor } from "./BowtieEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(initialValues: BowtieFormValues = emptyBowtieForm("bt_new")) {
  const onSaveDraft = vi.fn<(values: BowtieFormValues) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }));
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <BowtieEditor initialValues={initialValues} onSaveDraft={onSaveDraft} onPublish={onPublish} />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

const canonical = () => toBowtieForm(bowtieItemSchema.parse(FIXTURES.bowtie.canonical));

describe("BowtieEditor", () => {
  it("offers five actions, four conditions and five parameters under their headings", () => {
    setup();
    const actions = screen.getByRole("group", { name: "Actions to Take" });
    const conditions = screen.getByRole("group", { name: "Potential Condition" });
    const parameters = screen.getByRole("group", { name: "Parameters to Monitor" });
    expect(within(actions).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(conditions).getAllByRole("radio")).toHaveLength(4);
    expect(within(parameters).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(actions).getByRole("textbox", { name: "Action 5" })).toBeInTheDocument();
  });

  it("says how many actions are marked, and names the problem until exactly two are", async () => {
    const { user } = setup({ ...canonical() });
    const actions = screen.getByRole("group", { name: "Actions to Take" });
    expect(
      within(actions).getByText("Mark the two correct ones. 2 of 2 marked."),
    ).toBeInTheDocument();
    await user.click(within(actions).getByRole("checkbox", { name: "Action 1 is correct" }));
    const problems = screen.getByRole("region", { name: "Problems to fix" });
    expect(
      within(problems).getByRole("button", { name: "Mark exactly 2 actions to take (1 marked)." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("renames a column heading, which the preview uses too", async () => {
    const { user } = setup(canonical());
    const heading = screen.getByRole("textbox", { name: "Actions heading" });
    await user.clear(heading);
    await user.type(heading, "Nursing actions");
    expect(screen.getByRole("group", { name: "Nursing actions" })).toBeInTheDocument();
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(
      within(preview).getByRole("group", { name: "Nursing actions choices" }),
    ).toBeInTheDocument();
  });

  it("publishes the fixture bowtie unchanged", async () => {
    const { onPublish, user } = setup(canonical());
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(bowtieItemSchema.parse(onPublish.mock.calls[0][0])).toEqual(
      bowtieItemSchema.parse(FIXTURES.bowtie.canonical),
    );
  });
});
