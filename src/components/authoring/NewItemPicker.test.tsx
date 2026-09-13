import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewItemPicker } from "./NewItemPicker";

describe("NewItemPicker", () => {
  it("groups every format under a heading", () => {
    render(<NewItemPicker onChoose={vi.fn()} />);
    for (const name of ["Selection", "Matrix", "Drop-down", "Highlight", "Drag and drop"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button")).toHaveLength(14);
  });

  it("starts an item of the chosen type", async () => {
    const onChoose = vi.fn();
    render(<NewItemPicker onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: /Extended Multiple Response/ }));
    expect(onChoose).toHaveBeenCalledWith("multiple_response");
  });

  it("offers every format, with none held back for a later sprint", async () => {
    const onChoose = vi.fn();
    render(<NewItemPicker onChoose={onChoose} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-disabled", "true");
    }
    expect(screen.queryByText("Editor coming in Sprint 5")).not.toBeInTheDocument();
    const bowtie = within(screen.getByRole("group", { name: "Drag and drop" })).getByRole(
      "button",
      { name: /Bowtie/ },
    );
    await userEvent.click(bowtie);
    expect(onChoose).toHaveBeenCalledWith("bowtie");
  });
});
