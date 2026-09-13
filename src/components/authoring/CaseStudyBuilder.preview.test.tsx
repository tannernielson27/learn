import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCaseStudy } from "@/lib/ngn/fixtures/case-study";
import type { CaseStudy } from "@/lib/ngn/schemas";
import { validateCaseStudy } from "@/lib/ngn/validate";
import type { CjmmStep } from "@/lib/ngn/types";
import { useItemEditorHost } from "./ItemEditorHost";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { CaseStudyBuilder } = await import("./CaseStudyBuilder");
type BuilderProps = import("./CaseStudyBuilder").CaseStudyBuilderProps;

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

function FakeEditor({ label }: { label: string }) {
  const { onDirtyChange } = useItemEditorHost();
  const [text, setText] = useState("");
  useEffect(() => onDirtyChange?.(text !== ""), [text, onDirtyChange]);
  return (
    <label>
      {label}
      <input value={text} onChange={(event) => setText(event.target.value)} />
    </label>
  );
}

const sample = (): CaseStudy => {
  const result = validateCaseStudy(sampleCaseStudy);
  if (!result.ok) throw new Error("the sample case study must be valid");
  return result.value;
};

function setup(overrides: Partial<BuilderProps> = {}) {
  const publish = vi.fn<NonNullable<BuilderProps["publish"]>>(async () => ({ ok: true }));
  render(
    <CaseStudyBuilder
      back={{ href: "/author/banks/bank-1", label: "Back to bank" }}
      record={{ status: "ready", panel: <FakeEditor label="Record field" /> }}
      steps={[1, 2, 3, 4, 5, 6].map((position) => ({
        position: position as CjmmStep,
        status: "ready" as const,
        panel: <p>Step {position} editor</p>,
      }))}
      readyLabel="6 of 6 steps ready"
      preview={{ ok: true, caseStudy: sample() }}
      publish={publish}
      {...overrides}
    />,
  );
  return { publish, user: userEvent.setup() };
}

describe("previewing a case study", () => {
  it("plays the case study as a student would, then returns to editing", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Preview case study" }));
    expect(screen.queryByRole("navigation", { name: "Case study steps" })).not.toBeInTheDocument();
    expect(screen.getAllByText(sample().items[0]!.stem.value).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Back to editing" }));
    expect(screen.getByRole("navigation", { name: "Case study steps" })).toBeInTheDocument();
    expect(screen.getByLabelText("Record field")).toBeInTheDocument();
  });

  it("says what a preview still needs instead of opening", async () => {
    const { user } = setup({
      preview: { ok: false, blockers: ["Step 6 (Evaluate Outcomes) has no item yet."] },
    });
    await user.click(screen.getByRole("button", { name: "Preview case study" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This case study cannot be previewed yet.");
    expect(within(alert).getByText("Step 6 (Evaluate Outcomes) has no item yet.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Case study steps" })).toBeInTheDocument();
  });

  it("asks before previewing over unsaved changes", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Record field"), "typed");
    await user.click(screen.getByRole("button", { name: "Preview case study" }));
    const ask = within(screen.getByRole("alertdialog", { name: "The record has unsaved changes" }));
    await user.click(ask.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("button", { name: "Back to editing" })).toBeInTheDocument();
  });
});

describe("keeping the author oriented around preview and publish", () => {
  it("moves focus into the preview when it opens", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Preview case study" }));
    expect(screen.getByRole("region", { name: "Case study preview" })).toHaveFocus();
  });

  it("clears a publish notice once the author moves to another step", async () => {
    const { user } = setup({
      publish: vi.fn(async () => ({
        ok: false,
        error: "The case study is not ready to publish yet.",
        blockers: ["Step 4 (Generate Solutions) has no item yet."],
      })),
    });
    await user.click(screen.getByRole("button", { name: "Publish case study" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const rail = within(screen.getByRole("navigation", { name: "Case study steps" }));
    await user.click(rail.getByRole("button", { name: /^Step 4/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables Publish while a publish is in flight", async () => {
    let finish: (result: { ok: true }) => void = () => {};
    const { user } = setup({
      publish: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    await user.click(screen.getByRole("button", { name: "Publish case study" }));
    expect(screen.getByRole("button", { name: "Publish case study" })).toBeDisabled();
    finish({ ok: true });
    expect(await screen.findByText("Case study published.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish case study" })).not.toBeDisabled();
  });
});

describe("publishing a case study", () => {
  it("publishes, says so, and refreshes the page", async () => {
    const { publish, user } = setup();
    await user.click(screen.getByRole("button", { name: "Publish case study" }));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Case study published.")).toHaveAttribute("role", "status");
    expect(refresh).toHaveBeenCalled();
  });

  it("names every blocker when it cannot publish", async () => {
    const { user } = setup({
      publish: vi.fn(async () => ({
        ok: false,
        error: "The case study is not ready to publish yet.",
        blockers: [
          "Step 3 (Prioritize Hypotheses) needs its item finished and published.",
          "Step 4 (Generate Solutions) has no item yet.",
        ],
      })),
    });
    await user.click(screen.getByRole("button", { name: "Publish case study" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The case study is not ready to publish yet.");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks before publishing over unsaved changes", async () => {
    const { publish, user } = setup();
    await user.type(screen.getByLabelText("Record field"), "typed");
    await user.click(screen.getByRole("button", { name: "Publish case study" }));
    expect(publish).not.toHaveBeenCalled();
    const ask = within(screen.getByRole("alertdialog", { name: "The record has unsaved changes" }));
    await user.click(ask.getByRole("button", { name: "Stay on this step" }));
    expect(screen.getByLabelText("Record field")).toHaveValue("typed");
  });
});
