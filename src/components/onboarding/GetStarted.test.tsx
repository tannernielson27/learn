import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { checklistSteps, type OrgProgress } from "@/lib/onboarding/checklist";
import { GetStarted, type GetStartedProps } from "./GetStarted";
import type { SampleImportState } from "./ImportSampleForm";

const EMPTY: OrgProgress = { banks: [], hasClass: false, hasAssignmentOrSession: false };
const SAMPLE = { id: "00000000-0000-4000-8000-0000000000b2", name: "Sample bank" };

function setup(progress: OrgProgress, result: SampleImportState = { status: "idle" }) {
  const importSample = vi.fn<GetStartedProps["importSample"]>(async () => result);
  const hide = vi.fn(async () => {});
  render(<GetStarted steps={checklistSteps(progress)} importSample={importSample} hide={hide} />);
  return { importSample, hide, user: userEvent.setup() };
}

const stepRow = (title: string) =>
  within(screen.getByRole("list", { name: "Steps" }))
    .getAllByRole("listitem")
    .find((item) => item.textContent?.includes(title))!;

describe("GetStarted", () => {
  it("names itself and lists three steps, none done, in an empty org", () => {
    setup(EMPTY);
    const section = screen.getByRole("region", { name: "Get started" });
    expect(within(section).getByText("0 of 3 done")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(within(item).getByText("Not done", { exact: true })).toBeInTheDocument();
    }
  });

  it("marks the bank step done with words, not colour alone", () => {
    setup({ ...EMPTY, banks: [{ id: "b", name: "Cardiac" }] });
    expect(within(stepRow("Make a bank")).getByText("Done", { exact: true })).toBeInTheDocument();
    expect(within(stepRow("Make a class")).getByText("Not done", { exact: true })).toBeVisible();
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
  });

  it("offers the sample import and sends it to the action", async () => {
    const { importSample, user } = setup(EMPTY);
    await user.click(screen.getByRole("button", { name: "Import the sample bank" }));
    expect(importSample).toHaveBeenCalledTimes(1);
  });

  it("announces an import that failed", async () => {
    const { user } = setup(EMPTY, {
      status: "error",
      error: "The sample bank could not be imported. Try again.",
    });
    await user.click(screen.getByRole("button", { name: "Import the sample bank" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be imported");
  });

  it("links to the existing Sample bank instead of offering a second import", () => {
    setup({ ...EMPTY, banks: [SAMPLE] });
    expect(screen.queryByRole("button", { name: "Import the sample bank" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open the sample bank" })).toHaveAttribute(
      "href",
      `/author/banks/${SAMPLE.id}`,
    );
  });

  it("links each step to where it is done", () => {
    setup({ ...EMPTY, banks: [SAMPLE] });
    expect(screen.getByRole("link", { name: "Go to your classes" })).toHaveAttribute(
      "href",
      "/author/classes",
    );
    expect(screen.getByRole("link", { name: "Open Sample bank" })).toHaveAttribute(
      "href",
      `/author/banks/${SAMPLE.id}`,
    );
  });

  it("hides with a real button, from the keyboard", async () => {
    const { hide, user } = setup(EMPTY);
    const button = screen.getByRole("button", { name: "Hide this" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
