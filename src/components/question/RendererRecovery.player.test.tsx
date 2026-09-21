import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { RENDERER_FAILED } from "./RendererRecovery";

// `next/dynamic` is the App Router one here, as in the app: see vitest.setup.ts.

// The multiple choice renderer's chunk never arrives. A factory that throws leaves vitest's import
// pending rather than rejected, so the module loads and reading the renderer out of it fails, which
// rejects the same `import(...).then(...)` promise that a failed chunk would.
vi.mock("./multiple_choice/MultipleChoiceItem", () => ({
  get MultipleChoiceItem() {
    throw new Error("Failed to load chunk static/chunks/multiple_choice.js");
  },
}));

// The ordered response's chunk fails the same way. Its answer is complete on open, so it shows
// whether Submit waits for the question rather than only for the answer.
vi.mock("./ordered_response/OrderedResponseItem", () => ({
  get OrderedResponseItem() {
    throw new Error("Failed to load chunk static/chunks/ordered_response.js");
  },
}));

const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const ordered = itemSchema.parse(FIXTURES.ordered_response.canonical);

describe("ItemPlayer when a renderer fails to load", () => {
  it("shows the failure in the question area and keeps the stem and Submit bar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ItemPlayer item={mc} submit={scoreInProcess(mc)} />);

    const alert = await screen.findByRole("alert", {}, { timeout: 10_000 });
    expect(alert).toHaveTextContent(RENDERER_FAILED);
    expect(alert).not.toHaveTextContent(/chunk/);
    expect(screen.getByText(mc.stem.value.split(/\n{2,}/)[0])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("keeps Submit off when the question never arrived, even for an answer complete on open", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ItemPlayer item={ordered} submit={scoreInProcess(ordered)} />);

    await screen.findByRole("alert", {}, { timeout: 10_000 });
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    vi.restoreAllMocks();
  });
});
