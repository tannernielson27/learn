import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle, applyTheme } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies and persists an explicit theme, and clears it for system", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("learn.theme")).toBe("dark");
    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("learn.theme")).toBeNull();
  });

  it("hydrates from storage", async () => {
    localStorage.setItem("learn.theme", "light");
    render(<ThemeToggle />);
    expect(await screen.findByRole("radio", { name: "Light", checked: true })).toBeInTheDocument();
  });

  it("applyTheme survives a missing storage", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    expect(() => applyTheme("dark")).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
