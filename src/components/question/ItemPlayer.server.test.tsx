// ItemPlayer with a server-scored submit: it plays an item that carries no key, and the key and
// rationale arrive only with the score.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { scoreSubmission, toKeylessItem, type ScoreReveal } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";

const item = multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical);
const keyless = toKeylessItem(item);

function setup(submitResponse: (response: AnyResponse) => Promise<ScoreReveal>) {
  render(<ItemPlayer item={keyless} submit={submitResponse} />);
  return userEvent.setup();
}

async function answerCorrectly(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
}

describe("ItemPlayer with server scoring", () => {
  it("plays an item that carries no answer key, rationale or scoring", () => {
    expect(keyless).not.toHaveProperty("scoring");
    setup(vi.fn<(response: AnyResponse) => Promise<ScoreReveal>>());
    expect(screen.getByRole("radio", { name: /Auscultate the lungs/ })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Score" })).not.toBeInTheDocument();
  });

  it("shows the model's rule and the points once the server has scored the answer", async () => {
    const user = setup(async (response) => scoreSubmission(item, response));
    await answerCorrectly(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    const score = await screen.findByRole("complementary", { name: "Score" });
    expect(score).toHaveTextContent(`/ ${item.scoring.maxPoints}`);
    expect(score).toHaveTextContent(/0\/1 scoring/);
  });

  it("sends the response once, and shows Submit as busy while the server scores it", async () => {
    let finish: (value: ScoreReveal) => void = () => {};
    const submitResponse = vi.fn<(response: AnyResponse) => Promise<ScoreReveal>>(
      () => new Promise<ScoreReveal>((resolve) => (finish = resolve)),
    );
    const user = setup(submitResponse);
    await answerCorrectly(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    const busy = screen.getByRole("button", { name: "Checking your answer" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(submitResponse).toHaveBeenCalledTimes(1);
    expect(submitResponse.mock.calls[0][0]).toEqual({ type: "multiple_choice", optionId: "opt_a" });
    finish(scoreSubmission(item, { type: "multiple_choice", optionId: "opt_a" }));
    expect(await screen.findByRole("complementary", { name: "Score" })).toBeInTheDocument();
  });

  it("shows the server's score and rationale, and moves focus to the score", async () => {
    const user = setup(async (response) => scoreSubmission(item, response));
    await answerCorrectly(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    const score = await screen.findByRole("complementary", { name: "Score" });
    expect(score).toHaveTextContent("1");
    expect(score).toHaveTextContent(/fluid overload/);
    expect(score).toHaveFocus();
  });

  it("holds the answer that was sent while the server scores it", async () => {
    let finish: (value: ScoreReveal) => void = () => {};
    const submitResponse = vi.fn<(response: AnyResponse) => Promise<ScoreReveal>>(
      () => new Promise<ScoreReveal>((resolve) => (finish = resolve)),
    );
    const user = setup(submitResponse);
    await answerCorrectly(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    // A change mid-check would show one answer beside the score for another.
    await user.click(screen.getByRole("radio", { name: /Document the weight/ }));
    finish(scoreSubmission(item, { type: "multiple_choice", optionId: "opt_a" }));
    await screen.findByRole("complementary", { name: "Score" });
    expect(screen.getByRole("radio", { name: /Auscultate the lungs/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Document the weight/ })).not.toBeChecked();
  });

  it("clears a failed check's message once the answer changes", async () => {
    const user = setup(
      vi
        .fn<(response: AnyResponse) => Promise<ScoreReveal>>()
        .mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await answerCorrectly(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be checked");
    await user.click(screen.getByRole("radio", { name: /Document the weight/ }));
    expect(
      screen.queryByText("Your answer could not be checked. Try again."),
    ).not.toBeInTheDocument();
  });

  it("says when the answer could not be checked, and lets the student try again", async () => {
    const submitResponse = vi
      .fn<(response: AnyResponse) => Promise<ScoreReveal>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(async (response) => scoreSubmission(item, response));
    const user = setup(submitResponse);
    await answerCorrectly(user);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your answer could not be checked. Try again.",
    );
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(await screen.findByRole("complementary", { name: "Score" })).toBeInTheDocument();
    expect(submitResponse).toHaveBeenCalledTimes(2);
  });
});
