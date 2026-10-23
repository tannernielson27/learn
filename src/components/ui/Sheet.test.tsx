import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { Sheet } from "./Sheet";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("Sheet", () => {
  it("rises from the bottom at every width by default", () => {
    render(
      <Sheet open onClose={() => {}} title="Patient record">
        <p>Vital signs</p>
      </Sheet>,
    );
    const sheet = screen.getByRole("dialog", { name: "Patient record" });
    expect(sheet).toHaveClass("mt-auto", "rounded-t-md", "md:max-w-2xl");
    expect(sheet).not.toHaveClass("md:m-auto");
  });

  it("slides in from the end, full height, for a landscape phone", () => {
    render(<Sheet open onClose={() => {}} title="Patient record" side="end" />);
    const sheet = screen.getByRole("dialog", { name: "Patient record" });
    expect(sheet).toHaveClass("ml-auto", "h-dvh", "border-l");
    expect(sheet).not.toHaveClass("mt-auto");
  });
});
