import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import type { AttemptItemPayload } from "@/lib/assignments/attemptView";
import type { SaveResult } from "@/lib/assignments/autosave";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { AttemptPlayer } from "./AttemptPlayer";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const FIRST = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const SECOND = itemSchema.parse(FIXTURES.multiple_choice.edge) as Item;
const ATTEMPT = "00000000-0000-4000-8000-0000000208a1";
const ROW_1 = "00000000-0000-4000-8000-0000000208f1";
const ROW_2 = "00000000-0000-4000-8000-0000000208f2";

function payload(saved: AnyResponse | null = null): AttemptItemPayload[] {
  return [
    { itemId: ROW_1, position: 1, item: toKeylessItem(FIRST), saved },
    { itemId: ROW_2, position: 2, item: toKeylessItem(SECOND), saved: null },
  ];
}

function setup(
  items = payload(),
  save: (
    attemptId: string,
    itemId: string,
    response: AnyResponse,
  ) => Promise<SaveResult> = async () => ({
    ok: true,
  }),
  submit = vi.fn(async () => undefined as { error: string } | undefined),
) {
  const saving = vi.fn(save);
  render(
    <AttemptPlayer
      attemptId={ATTEMPT}
      attemptNumber={1}
      items={items}
      submit={submit}
      save={saving}
    />,
  );
  return { save: saving, submit, user: userEvent.setup() };
}

describe("AttemptPlayer (#208)", () => {
  it("saves a change on its own, says Saved, and has no per-item Submit", async () => {
    const view = setup();
    await renderersLoaded();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByTestId("save-status")).toHaveTextContent("Your answers save as you go.");

    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    expect(screen.getByTestId("save-status")).toHaveTextContent("Saving");
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("Saved"), {
      timeout: 3000,
    });
    expect(view.save).toHaveBeenCalledWith(ATTEMPT, ROW_1, {
      type: "multiple_choice",
      optionId: "opt_a",
    });
    expect(screen.getByTestId("answered-count")).toHaveTextContent("1 of 2 answered");
    expect(screen.getByRole("button", { name: "Item 1, answered" })).toBeInTheDocument();
  });

  it("says Not saved, retrying when a save fails", async () => {
    const view = setup(payload(), async () => ({ ok: false, refusal: "failed", final: false }));
    await renderersLoaded();
    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await waitFor(
      () => expect(screen.getByTestId("save-status")).toHaveTextContent("Not saved, retrying"),
      { timeout: 3000 },
    );
  });

  it("opens on what was saved before, on any device", async () => {
    setup(payload({ type: "multiple_choice", optionId: "opt_c" }));
    await renderersLoaded();
    expect(screen.getByRole("radio", { name: /Document the weight/ })).toBeChecked();
    expect(screen.getByTestId("answered-count")).toHaveTextContent("1 of 2 answered");
  });

  it("moves through the set with the list, Next and Previous, keeping each answer", async () => {
    const view = setup();
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Previous item" })).toBeDisabled();
    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await view.user.click(screen.getByRole("button", { name: "Next item" }));
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Item 2, not answered" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await view.user.click(screen.getByRole("button", { name: "Item 1, answered" }));
    expect(screen.getByRole("radio", { name: /Auscultate the lungs/ })).toBeChecked();
  });

  it("sends anything still waiting, then submits, after asking once", async () => {
    const view = setup();
    await renderersLoaded();
    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await view.user.click(screen.getByRole("button", { name: "Submit assignment" }));
    expect(screen.getByRole("heading", { name: "Submit attempt 1?" })).toBeInTheDocument();
    expect(
      screen.getByText(/1 of 2 answered\. You cannot change your answers/),
    ).toBeInTheDocument();

    await view.user.click(screen.getByRole("button", { name: "Submit now" }));
    await waitFor(() => expect(view.submit).toHaveBeenCalledWith(ATTEMPT));
    // The save went first, without waiting out the debounce.
    expect(view.save).toHaveBeenCalledTimes(1);
    expect(view.save.mock.invocationCallOrder[0]).toBeLessThan(
      view.submit.mock.invocationCallOrder[0] as number,
    );
  });

  it("does not submit while an answer cannot be saved, and says so", async () => {
    const view = setup(payload(), async () => ({ ok: false, refusal: "failed", final: false }));
    await renderersLoaded();
    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await view.user.click(screen.getByRole("button", { name: "Submit assignment" }));
    await view.user.click(screen.getByRole("button", { name: "Submit now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not saved yet/);
    expect(view.submit).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the submit is refused, and lets the student go back", async () => {
    const submit = vi.fn(async () => ({ error: "This assignment has closed." }));
    const view = setup(payload(), undefined, submit);
    await renderersLoaded();
    await view.user.click(screen.getByRole("button", { name: "Submit assignment" }));
    await view.user.click(screen.getByRole("button", { name: "Submit now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This assignment has closed.");
    await view.user.click(screen.getByRole("button", { name: "Keep working" }));
    expect(screen.getByRole("button", { name: "Submit assignment" })).toBeInTheDocument();
  });

  it("stops saving and reads the page again when the assignment has closed", async () => {
    refresh.mockClear();
    const view = setup(payload(), async () => ({ ok: false, refusal: "closed", final: true }));
    await renderersLoaded();
    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled(), { timeout: 3000 });
    expect(screen.getByTestId("save-status")).toHaveTextContent("This assignment has closed.");
    expect(screen.getByRole("button", { name: "Submit assignment" })).toBeDisabled();
  });
});
