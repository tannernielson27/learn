import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useItemEditorHost } from "./ItemEditorHost";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { CaseStudyBuilder } = await import("./CaseStudyBuilder");
type BuilderStep = import("./CaseStudyBuilder").BuilderStep;

beforeEach(() => push.mockReset());

/** Stands in for a type chooser: tells the builder a step has just been started. */
function FakeStarter() {
  const { onStepStarted } = useItemEditorHost();
  return (
    <button type="button" onClick={() => onStepStarted?.()}>
      Start this step
    </button>
  );
}

/** Stands in for an editor: a text field that reports unsaved changes to the builder. */
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

const steps: BuilderStep[] = [
  { position: 1, status: "ready", panel: <FakeEditor label="Step 1 field" /> },
  { position: 2, status: "draft", panel: <FakeEditor label="Step 2 field" /> },
  { position: 3, status: "empty", panel: <p>Choose a type for step 3</p> },
  { position: 4, status: "empty", panel: <p>Choose a type for step 4</p> },
  { position: 5, status: "attention", panel: <FakeEditor label="Step 5 field" /> },
  { position: 6, status: "empty", panel: <FakeStarter /> },
];

function setup() {
  render(
    <CaseStudyBuilder
      back={{ href: "/author/banks/bank-1", label: "Back to bank" }}
      record={{ status: "ready", panel: <FakeEditor label="Record field" /> }}
      steps={steps}
      readyLabel="1 of 6 steps ready"
    />,
  );
  return userEvent.setup();
}

describe("CaseStudyBuilder, leaving and starting", () => {
  it("asks before leaving the case study with unsaved changes", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Record field"), "typed");
    await user.click(screen.getByRole("link", { name: "Back to bank" }));
    expect(push).not.toHaveBeenCalled();
    const leave = within(
      screen.getByRole("alertdialog", { name: "The record has unsaved changes" }),
    );
    await user.click(leave.getByRole("button", { name: "Discard changes" }));
    expect(push).toHaveBeenCalledWith("/author/banks/bank-1");
  });

  it("leaves without asking when nothing is unsaved", async () => {
    const user = setup();
    await user.click(screen.getByRole("link", { name: "Back to bank" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/author/banks/bank-1");
  });

  it("keeps focus on the step once it has been started", async () => {
    const user = setup();
    await user.click(railButton(/^Step 6/));
    await user.click(screen.getByRole("button", { name: "Start this step" }));
    expect(screen.getByRole("region", { name: "Step 6: Evaluate Outcomes" })).toHaveFocus();
  });
});

const rail = () => within(screen.getByRole("navigation", { name: "Case study steps" }));
const railButton = (name: RegExp) => rail().getByRole("button", { name });
const ask = () => within(screen.getByRole("alertdialog", { name: "Step 1 has unsaved changes" }));

describe("CaseStudyBuilder", () => {
  it("lists the record and all six steps, each with its status in words", () => {
    setup();
    expect(railButton(/^Record/)).toHaveTextContent("Ready");
    expect(railButton(/^Step 1: Recognize Cues/)).toHaveTextContent("Ready");
    expect(railButton(/^Step 2: Analyze Cues/)).toHaveTextContent("Draft");
    expect(railButton(/^Step 3: Prioritize Hypotheses/)).toHaveTextContent("Not started");
    expect(railButton(/^Step 5: Take Action/)).toHaveTextContent("Needs attention");
    expect(screen.getByText("1 of 6 steps ready")).toBeInTheDocument();
  });

  it("opens the record first, and any step in any order", async () => {
    const user = setup();
    expect(screen.getByLabelText("Record field")).toBeInTheDocument();
    expect(railButton(/^Record/)).toHaveAttribute("aria-current", "step");
    await user.click(railButton(/^Step 4/));
    expect(screen.getByText("Choose a type for step 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Step 4: Generate Solutions" }),
    ).toBeInTheDocument();
    await user.click(railButton(/^Step 2/));
    expect(screen.getByLabelText("Step 2 field")).toBeInTheDocument();
    expect(railButton(/^Step 2/)).toHaveAttribute("aria-current", "step");
  });

  it("asks before leaving a step with unsaved changes, and stays when asked to", async () => {
    const user = setup();
    await user.click(railButton(/^Step 1/));
    await user.type(screen.getByLabelText("Step 1 field"), "typed");

    await user.click(railButton(/^Step 2/));
    await user.click(ask().getByRole("button", { name: "Stay on this step" }));
    expect(screen.getByLabelText("Step 1 field")).toHaveValue("typed");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(railButton(/^Step 2/));
    await user.click(ask().getByRole("button", { name: "Discard changes" }));
    expect(screen.getByLabelText("Step 2 field")).toBeInTheDocument();
    expect(screen.queryByLabelText("Step 1 field")).not.toBeInTheDocument();
  });

  it("moves between steps without asking when nothing is unsaved", async () => {
    const user = setup();
    await user.click(railButton(/^Step 6/));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start this step" })).toBeInTheDocument();
  });
});
