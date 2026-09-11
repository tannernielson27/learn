import { describe, expect, it } from "vitest";
import { applyStagger, MAX_STAGGER } from "./motion";

function markup(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

const stagger = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`#${id}`)!.style.getPropertyValue("--stagger");

describe("applyStagger", () => {
  it("numbers visible feedback marks in reading order and skips hidden ones", () => {
    const root = markup(`
      <span data-feedback-mark id="a"></span>
      <div><span data-feedback-mark id="b" data-hidden></span></div>
      <span data-feedback-mark id="c"></span>
      <span id="plain"></span>
    `);
    applyStagger(root, (el) => !el.hasAttribute("data-hidden"));
    expect(stagger(root, "a")).toBe("0");
    expect(stagger(root, "c")).toBe("1");
    expect(stagger(root, "b")).toBe("");
    expect(stagger(root, "plain")).toBe("");
  });

  it("caps the index so the whole reveal ends within 320ms", () => {
    const root = markup(
      Array.from({ length: 9 }, (_, i) => `<span data-feedback-mark id="m${i}"></span>`).join(""),
    );
    applyStagger(root, () => true);
    expect(MAX_STAGGER).toBe(5);
    expect(stagger(root, "m4")).toBe("4");
    expect(stagger(root, "m5")).toBe("5");
    expect(stagger(root, "m8")).toBe("5");
  });
});
