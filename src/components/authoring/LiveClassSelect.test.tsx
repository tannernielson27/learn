import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveClassSelect, NO_CLASS_LABEL } from "./LiveClassSelect";

const CLASSES = [
  { id: "00000000-0000-4000-8000-0000000000d1", name: "NUR 310" },
  { id: "00000000-0000-4000-8000-0000000000d2", name: "NUR 320" },
];

describe("LiveClassSelect (ADR 0013)", () => {
  it("offers No class first and selected, then each of the teacher's classes", () => {
    render(<LiveClassSelect id="live-class" classes={CLASSES} />);
    const select = screen.getByRole("combobox", { name: "For a class" });
    expect(select).toHaveAttribute("name", "classId");
    expect(select).toHaveValue("");
    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      NO_CLASS_LABEL,
      "NUR 310",
      "NUR 320",
    ]);
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      "",
      CLASSES[0]?.id,
      CLASSES[1]?.id,
    ]);
    expect(NO_CLASS_LABEL).toBe("No class (anyone joins)");
  });

  it("is left out when there is no class to choose, so the start is the quick session it was", () => {
    const { container: none } = render(<LiveClassSelect id="a" classes={[]} />);
    expect(none).toBeEmptyDOMElement();
    const { container: unread } = render(<LiveClassSelect id="b" classes={null} />);
    expect(unread).toBeEmptyDOMElement();
  });
});
