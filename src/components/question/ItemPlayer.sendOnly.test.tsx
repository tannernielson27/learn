// ItemPlayer for a caller whose submit only sends the answer (a live room): Submit's busy label
// says so, and a refusal the caller can name is shown in its own words.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { toKeylessItem, type ScoreReveal } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { ItemPlayer } from "./ItemPlayer";

const keyless = toKeylessItem(multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical));

class Refusal extends Error {}

async function setup(submit: (response: AnyResponse) => Promise<ScoreReveal>) {
  render(
    <ItemPlayer
      item={keyless}
      submit={submit}
      busyLabel="Sending your answer"
      failureMessage={(error) => (error instanceof Refusal ? error.message : undefined)}
    />,
  );
  await renderersLoaded();
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
  return user;
}

describe("ItemPlayer with a submit that only sends", () => {
  it("says the answer is being sent, not checked", async () => {
    const user = await setup(() => new Promise<ScoreReveal>(() => {}));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("button", { name: "Sending your answer" })).toBeInTheDocument();
  });

  it("shows a refusal the caller names in its own words", async () => {
    const user = await setup(
      vi.fn(() => Promise.reject(new Refusal("The session has moved on to another item."))),
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The session has moved on to another item.",
    );
  });

  it("falls back to its own sentence for a failure the caller cannot name", async () => {
    const user = await setup(vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your answer could not be checked. Try again.",
    );
  });
});
