import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { RENDERER_FAILED } from "./RendererRecovery";

// Outside a Next build, `next/dynamic` resolves to the Pages Router loader, which catches a failed
// load and keeps showing the placeholder. Next aliases it to this module in the App Router (see
// createAppRouterApiAliases in next/dist/build/create-compiler-aliases.js): `React.lazy`, which
// throws a failed load to the nearest error boundary. The test uses what the app ships.
vi.mock("next/dynamic", async () => {
  const appDynamic: { default?: unknown } = await import("next/dist/shared/lib/app-dynamic");
  return { default: appDynamic.default ?? appDynamic };
});

// The multiple choice renderer's chunk never arrives. A factory that throws leaves vitest's import
// pending rather than rejected, so the module loads and reading the renderer out of it fails, which
// rejects the same `import(...).then(...)` promise that a failed chunk would.
vi.mock("./multiple_choice/MultipleChoiceItem", () => ({
  get MultipleChoiceItem() {
    throw new Error("Failed to load chunk static/chunks/multiple_choice.js");
  },
}));

const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);

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
});
