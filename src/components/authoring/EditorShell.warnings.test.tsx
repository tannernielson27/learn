import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyMultipleChoiceForm,
  toMultipleChoiceForm,
} from "@/lib/authoring/forms/multipleChoice";
import { toMultipleResponseForm } from "@/lib/authoring/forms/multipleResponse";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema, multipleResponseItemSchema } from "@/lib/ngn/schemas";
import { MultipleChoiceEditor } from "./MultipleChoiceEditor";
import { MultipleResponseEditor } from "./MultipleResponseEditor";

const noop = () => vi.fn(async () => ({ ok: true }));

const mcWithoutRationale = () => ({
  ...toMultipleChoiceForm(multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical)),
  rationaleGeneral: "",
});

const sata = (change: (item: typeof FIXTURES.multiple_response.canonical) => unknown) =>
  toMultipleResponseForm(
    multipleResponseItemSchema.parse(change(FIXTURES.multiple_response.canonical)),
  );

describe("EditorShell and a missing rationale", () => {
  it("lists the rationale as a problem and keeps Publish from publishing", async () => {
    const onPublish = noop();
    const user = userEvent.setup();
    render(
      <MultipleChoiceEditor
        initialValues={mcWithoutRationale()}
        onSaveDraft={noop()}
        onPublish={onPublish}
      />,
    );

    const problems = screen.getByRole("region", { name: "Problems to fix" });
    const message = within(problems).getByRole("button", {
      name: "Write the rationale. An item needs one before it can be published.",
    });
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    await user.click(publish);
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(message);
    const rationale = screen.getByLabelText("Rationale");
    expect(rationale).toHaveFocus();
    expect(rationale).toHaveAttribute("aria-invalid", "true");

    await user.type(rationale, "Orthopnea and weight gain point to fluid overload.");
    expect(screen.queryByRole("region", { name: "Problems to fix" })).toBeNull();
    expect(publish).not.toHaveAttribute("aria-disabled", "true");
    await user.click(publish);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("still saves a draft without one", async () => {
    const onSaveDraft = noop();
    const user = userEvent.setup();
    render(
      <MultipleChoiceEditor
        initialValues={mcWithoutRationale()}
        onSaveDraft={onSaveDraft}
        onPublish={noop()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it("lists it among an unfinished item's other problems", () => {
    render(
      <MultipleChoiceEditor
        initialValues={emptyMultipleChoiceForm("mc_new")}
        onSaveDraft={noop()}
        onPublish={noop()}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "Problems to fix" })).getByRole("button", {
        name: /Write the rationale/,
      }),
    ).toBeInTheDocument();
  });
});

describe("EditorShell quality warnings", () => {
  it("lists advice beside the problems, points at its field, and does not block Publish", async () => {
    const onPublish = noop();
    const user = userEvent.setup();
    render(
      <MultipleResponseEditor
        initialValues={sata((item) => ({
          ...item,
          answerKey: { correctOptionIds: item.content.options.map((option) => option.id) },
        }))}
        onSaveDraft={noop()}
        onPublish={onPublish}
      />,
    );

    const warnings = screen.getByRole("region", { name: "Quality warnings" });
    expect(within(warnings).getByText(/do not stop you publishing/)).toBeInTheDocument();
    await user.click(
      within(warnings).getByRole("button", { name: /Every option is marked correct/ }),
    );
    expect(screen.getByRole("checkbox", { name: "Option A is correct" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("clears a warning once the field is fixed", async () => {
    const user = userEvent.setup();
    render(
      <MultipleResponseEditor
        initialValues={sata((item) => {
          const perElement = Object.fromEntries(
            Object.entries(item.rationale?.perElement ?? {}).filter(([id]) => id !== "opt_b"),
          );
          return { ...item, rationale: { ...item.rationale, perElement } };
        })}
        onSaveDraft={noop()}
        onPublish={noop()}
      />,
    );

    const warnings = screen.getByRole("region", { name: "Quality warnings" });
    await user.click(
      within(warnings).getByRole("button", {
        name: "Explain why option B is right or wrong.",
      }),
    );
    const why = screen.getByLabelText("Why option B is right or wrong (optional)");
    expect(why).toHaveFocus();
    await user.type(why, "Crackles are expected with pneumonia.");
    expect(screen.queryByRole("region", { name: "Quality warnings" })).toBeNull();
  });

  it("shows no advice while the item is unfinished", () => {
    render(
      <MultipleChoiceEditor
        initialValues={{ ...emptyMultipleChoiceForm("mc_new"), stem: "A client is anxious." }}
        onSaveDraft={noop()}
        onPublish={noop()}
      />,
    );
    expect(screen.queryByRole("region", { name: "Quality warnings" })).toBeNull();
  });
});
