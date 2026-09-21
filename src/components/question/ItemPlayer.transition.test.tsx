// #55: Submit acknowledges the press first and draws the feedback after it. jsdom never paints, so
// what is checked here is the order React is asked to do the work in; scripts/measure-inp.mjs
// measures what that order is worth in a browser.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { scoreInProcess, type ScoreReveal } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { startTransition } from "react";
import { ItemPlayer } from "./ItemPlayer";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, startTransition: vi.fn(actual.startTransition) };
});

const react = await vi.importActual<typeof import("react")>("react");
const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const transition = vi.mocked(startTransition);

async function answer(submit: (response: AnyResponse) => Promise<ScoreReveal>) {
  const onSubmitted = vi.fn();
  render(<ItemPlayer item={mc} submit={submit} onSubmitted={onSubmitted} />);
  await renderersLoaded();
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
  transition.mockClear();
  return { user, onSubmitted };
}

describe("ItemPlayer submit priority", () => {
  beforeEach(() => {
    transition.mockClear();
  });

  it("draws the feedback, and tells the caller, inside one transition", async () => {
    const { user, onSubmitted } = await answer(scoreInProcess(mc));
    // What the transition holds, recorded as it runs: nothing of the reveal has happened before it.
    transition.mockImplementationOnce((reveal) => {
      expect(onSubmitted).not.toHaveBeenCalled();
      react.startTransition(reveal);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Submit" }));

    const score = await screen.findByRole("complementary", { name: "Score" });
    // Focus moves in an effect after the transition commits, which can land after the panel shows.
    await waitFor(() => expect(score).toHaveFocus());
    expect(transition).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Submit|Checking/ })).not.toBeInTheDocument();
  });

  it("shows Submit as busy, and sends nothing more, until the feedback arrives", async () => {
    let finish = () => {};
    const submit = vi.fn(
      (response: AnyResponse) =>
        new Promise<ScoreReveal>((done) => {
          finish = () => void scoreInProcess(mc)(response).then(done);
        }),
    );
    const { user } = await answer(submit);

    await user.click(screen.getByRole("button", { name: "Submit" }));
    const busy = screen.getByRole("button", { name: "Checking your answer" });
    expect(transition).not.toHaveBeenCalled();
    await user.click(busy);
    expect(submit).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByRole("complementary", { name: "Score" })).toBeInTheDocument();
    expect(transition).toHaveBeenCalledTimes(1);
  });

  it("reports a failed check straight away, not as a transition", async () => {
    const { user } = await answer(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be checked");
    expect(transition).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });
});
