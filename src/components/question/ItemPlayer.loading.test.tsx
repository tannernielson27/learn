import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { RENDERER_LOADING } from "./RendererLoading";
import { renderersLoaded } from "./testing/renderers";

// The ordered response renderer's chunk is held back until the test lets it through, so the
// player can be looked at while its question is still the loading placeholder.
const gate = vi.hoisted(() => {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => open() };
});

vi.mock("./ordered_response/OrderedResponseItem", async (importOriginal) => {
  await gate.opened;
  return importOriginal();
});

const ordered = itemSchema.parse(FIXTURES.ordered_response.canonical);

describe("ItemPlayer while its renderer loads", () => {
  it("keeps Submit off until the question is on screen, even for an answer complete on open", async () => {
    // An ordered response opens already arranged, so its answer is complete before it is seen.
    render(<ItemPlayer item={ordered} submit={scoreInProcess(ordered)} />);

    expect(screen.getByText(RENDERER_LOADING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("aria-disabled", "true");

    gate.open();
    await renderersLoaded();
    expect(await screen.findByRole("button", { name: "Submit" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });
});
