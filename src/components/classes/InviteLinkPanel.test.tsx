import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InviteLinkPanel } from "./InviteLinkPanel";

const URL_TEXT = "https://learn.example/c/AbC_-0123456789abcdefghijklmnopq";
const CODE = "ABCD2345";

function renderPanel() {
  return render(
    <InviteLinkPanel
      url={URL_TEXT}
      code={CODE}
      classTitle="NUR 310"
      rotateAction={async () => {}}
    />,
  );
}

describe("InviteLinkPanel", () => {
  it("shows the link in a labelled box, a copy button, a QR code and a way to replace it", () => {
    renderPanel();
    const box = screen.getByRole("textbox", { name: "Invite link" });
    expect(box).toHaveValue(URL_TEXT);
    expect(box).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code for the NUR 310 invite link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace the link" })).toBeInTheDocument();
  });

  it("shows the class code beside the link as two groups of four", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Class code" })).toBeInTheDocument();
    expect(screen.getByTestId("class-code")).toHaveTextContent(/^ABCD-2345$/);
  });

  it("copies the code without the hyphen, as a student's box and the database read it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Copy class code" }));
    expect(writeText).toHaveBeenCalledWith("ABCD2345");
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toContain("Copied.");
  });

  it("says the code goes too when the link is replaced", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Replace the link" }));
    expect(await screen.findByText(/link, class code and QR code stop working/)).toBeVisible();
  });
});
