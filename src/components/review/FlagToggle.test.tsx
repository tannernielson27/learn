import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FlagToggle } from "./FlagToggle";

function Harness() {
  const [flagged, setFlagged] = useState(false);
  return <FlagToggle flagged={flagged} label="step 2" onChange={setFlagged} />;
}

describe("FlagToggle", () => {
  it("is a pressed-state button whose name does not move as it toggles", async () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Flag step 2" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    // The same button, now pressed: the state is the announcement, not a change of wording.
    expect(screen.getByRole("button", { name: "Flag step 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reports the state it is moving to", async () => {
    const onChange = vi.fn();
    render(<FlagToggle flagged={false} label="step 2" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Flag step 2" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is reachable and operable from the keyboard", async () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Flag step 2" });
    button.focus();
    await userEvent.keyboard(" ");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});
