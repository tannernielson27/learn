import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageShell } from "./StageShell";

describe("StageShell", () => {
  it("is a light, full-viewport container region with the safe area inside it", () => {
    render(
      <StageShell>
        <p>V96 RN8</p>
      </StageShell>,
    );
    const stage = screen.getByRole("region", { name: "Projector view" });
    expect(stage).toHaveAttribute("data-theme", "light");
    expect(stage).toHaveClass("fixed", "inset-0", "[container-type:size]", "bg-stage-surface");
    expect(stage.firstElementChild).toHaveClass(
      "px-(--stage-pad-inline)",
      "py-(--stage-pad-block)",
    );
  });
});
