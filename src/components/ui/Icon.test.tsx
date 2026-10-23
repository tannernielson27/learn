import { render, screen } from "@testing-library/react";
import { Folder } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("draws at 20px with a 1.75 stroke, hidden as decoration", () => {
    const { container } = render(<Icon icon={Folder} className="text-ink-2" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
    expect(svg).toHaveAttribute("stroke-width", "1.75");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("shrink-0", "text-ink-2");
  });

  it("draws the stage size at 32px with a 2.5 stroke", () => {
    const { container } = render(<Icon icon={Folder} size="stage" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("stroke-width", "2.5");
  });

  it("is an image with a name when it has a label", () => {
    render(<Icon icon={Folder} label="Folder" />);
    const img = screen.getByRole("img", { name: "Folder" });
    expect(img).not.toHaveAttribute("aria-hidden");
  });
});
