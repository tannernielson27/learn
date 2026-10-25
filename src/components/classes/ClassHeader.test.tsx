import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClassHeader } from "./ClassHeader";

const URL_TEXT = "https://learn.example/c/AbC_-0123456789abcdefghijklmnopq";

function renderHeader(studentCount: number | null = 4) {
  return render(
    <ClassHeader
      name="NUR 310 Adult Health"
      studentCount={studentCount}
      url={URL_TEXT}
      code="ABCD2345"
    />,
  );
}

describe("ClassHeader", () => {
  it("names the class as the page's one heading, with how many students it has", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 1, name: "NUR 310 Adult Health" })).toBeVisible();
    // Nothing in the header is a heading below the h1: the page's sections come after the tabs.
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByText("4 students")).toBeVisible();
  });

  it("says one student in the singular", () => {
    renderHeader(1);
    expect(screen.getByText("1 student")).toBeVisible();
  });

  it("leaves the count out when the roster could not be read, rather than saying zero", () => {
    renderHeader(null);
    expect(screen.queryByText(/students?$/)).not.toBeInTheDocument();
  });

  it("shows the class code and the invite link, each with its copy button", () => {
    renderHeader();
    expect(screen.getByTestId("class-code")).toHaveTextContent(/^ABCD-2345$/);
    expect(screen.getByRole("textbox", { name: "Invite link" })).toHaveValue(URL_TEXT);
    expect(screen.getByRole("button", { name: "Copy class code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeInTheDocument();
  });

  it("copies the invite link", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
  });

  it("does not offer to replace the link, which is in the settings", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "Replace the link" })).not.toBeInTheDocument();
  });
});
