import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOIN_CODE_ERROR } from "@/lib/live/joinForm";
import { JoinDoor } from "./JoinDoor";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// #563: the student's way in from the front page.
describe("JoinDoor", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("asks for the join code alone, and says no account is needed", () => {
    render(<JoinDoor />);
    expect(screen.getByRole("heading", { level: 2, name: "Join a live session" })).toBeVisible();
    expect(screen.getByText("In class now? No account needed.")).toBeInTheDocument();
    const field = screen.getByRole("textbox", { name: "Join code" });
    expect(field).toHaveAttribute("autocapitalize", "characters");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "9");
    expect(field).toHaveAccessibleDescription(/6 characters/);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("is a plain GET form to /join, so it works before JavaScript", () => {
    render(<JoinDoor />);
    const form = screen.getByRole("textbox", { name: "Join code" }).closest("form");
    expect(form).toHaveAttribute("action", "/join");
    expect(form).toHaveAttribute("method", "get");
  });

  it("goes to /join/[code] with the code normalized, from the keyboard", async () => {
    const user = userEvent.setup();
    render(<JoinDoor />);
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Join code" })).toHaveFocus();
    await user.keyboard("7kq 2mz{Enter}");
    expect(push).toHaveBeenCalledWith("/join/7KQ2MZ");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says what a join code is for an empty or impossible code, and stays", async () => {
    const user = userEvent.setup();
    render(<JoinDoor />);
    const field = screen.getByRole("textbox", { name: "Join code" });
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(screen.getByRole("alert")).toHaveTextContent(JOIN_CODE_ERROR);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();

    await user.type(field, "OI1");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(screen.getByRole("alert")).toHaveTextContent(JOIN_CODE_ERROR);
    expect(push).not.toHaveBeenCalled();
  });
});
