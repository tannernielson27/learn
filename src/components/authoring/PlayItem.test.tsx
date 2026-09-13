import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toKeylessPlayItem } from "@/lib/authoring/play";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { sampleTrendItem } from "@/lib/ngn/fixtures/trend";
import { validateItem } from "@/lib/ngn/validate";
import { PlayItem } from "./PlayItem";

function keyless(input: unknown) {
  const result = validateItem(input);
  if (!result.ok) throw new Error("fixture should be valid");
  return toKeylessPlayItem(result.value);
}

describe("PlayItem", () => {
  it("shows a standalone item's record beside the question, with its time selector", () => {
    render(<PlayItem itemId="item-1" item={keyless(sampleTrendItem)} />);
    expect(screen.getAllByRole("radiogroup", { name: "Time" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("68-year-old male").length).toBeGreaterThan(0);
  });

  it("shows no record for an item without one", () => {
    render(<PlayItem itemId="item-2" item={keyless(FIXTURES.multiple_choice.canonical)} />);
    expect(screen.queryByRole("radiogroup", { name: "Time" })).not.toBeInTheDocument();
    expect(screen.queryByText("Patient record")).not.toBeInTheDocument();
  });
});
