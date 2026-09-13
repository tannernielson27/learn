import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startStepItem =
  vi.fn<(id: string, position: number, type: string) => Promise<{ error: string }>>();
const refresh = vi.fn();

vi.mock("@/app/author/case-studies/[caseStudyId]/actions", () => ({
  startStepItem: (...args: [string, number, string]) => startStepItem(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StepItemPanel } = await import("./StepItemPanel");
const { StepTypeChooser } = await import("./StepTypeChooser");

const CASE_ID = "3f8a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b";

beforeEach(() => {
  startStepItem.mockReset();
  refresh.mockReset();
});

describe("StepTypeChooser", () => {
  it("starts the step with the chosen type, then refreshes the case study", async () => {
    startStepItem.mockResolvedValue({ error: "" });
    render(<StepTypeChooser caseStudyId={CASE_ID} position={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Multiple Choice" }));
    expect(startStepItem).toHaveBeenCalledWith(CASE_ID, 3, "multiple_choice");
    expect(refresh).toHaveBeenCalled();
  });

  it("tells the case study a step has started, so it can keep the author's place", async () => {
    startStepItem.mockResolvedValue({ error: "" });
    const onStepStarted = vi.fn();
    const { ItemEditorHostContext } = await import("./ItemEditorHost");
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: true, onStepStarted }}>
        <StepTypeChooser caseStudyId={CASE_ID} position={3} />
      </ItemEditorHostContext.Provider>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Multiple Choice" }));
    expect(onStepStarted).toHaveBeenCalledTimes(1);
  });

  it("says why the step could not be started", async () => {
    startStepItem.mockResolvedValue({ error: "That item is in another bank." });
    render(<StepTypeChooser caseStudyId={CASE_ID} position={3} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Multiple Choice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That item is in another bank.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("StepItemPanel", () => {
  function setup() {
    render(
      <StepItemPanel caseStudyId={CASE_ID} position={2} typeLabel="Matrix Multiple Choice">
        <p>The step item editor</p>
      </StepItemPanel>,
    );
    return userEvent.setup();
  }

  it("shows the step's item type and its editor", () => {
    setup();
    expect(screen.getByText("Matrix Multiple Choice")).toBeInTheDocument();
    expect(screen.getByText("The step item editor")).toBeInTheDocument();
  });

  it("warns that changing the type loses the step's answers, and keeps the item when asked", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Change type" }));
    expect(
      screen.getByText(
        "Changing the type starts a new item for this step. Its question and answers will be lost.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep this item" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep this item" }));
    expect(screen.getByText("The step item editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change type" })).toHaveFocus();
  });

  it("offers the types once the author confirms", async () => {
    startStepItem.mockResolvedValue({ error: "" });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Change type" }));
    await user.click(screen.getByRole("button", { name: "Choose another type" }));
    expect(screen.queryByText("The step item editor")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bowtie" }));
    expect(startStepItem).toHaveBeenCalledWith(CASE_ID, 2, "bowtie");
  });
});
