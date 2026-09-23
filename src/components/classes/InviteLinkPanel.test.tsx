import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InviteLinkPanel } from "./InviteLinkPanel";

const URL_TEXT = "https://learn.example/c/AbC_-0123456789abcdefghijklmnopq";

describe("InviteLinkPanel", () => {
  it("shows the link in a labelled box, a copy button, a QR code and a way to replace it", () => {
    render(<InviteLinkPanel url={URL_TEXT} classTitle="NUR 310" rotateAction={async () => {}} />);
    const box = screen.getByRole("textbox", { name: "Invite link" });
    expect(box).toHaveValue(URL_TEXT);
    expect(box).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code for the NUR 310 invite link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace the link" })).toBeInTheDocument();
  });
});
