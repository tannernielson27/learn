import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopyLinkButton } from "./CopyLinkButton";

const URL_TEXT = "https://learn.example/c/AbC_-0123456789abcdefghijklmnopq";

describe("CopyLinkButton", () => {
  it("copies the link and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyLinkButton url={URL_TEXT} />);
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(await screen.findByRole("status")).toHaveTextContent("Copied.");
  });

  it("asks the person to copy it by hand when the clipboard refuses", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<CopyLinkButton url={URL_TEXT} />);
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/copy it from the box/);
  });
});
