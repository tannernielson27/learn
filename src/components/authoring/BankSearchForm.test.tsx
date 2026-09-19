import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_BANK_FILTER } from "@/lib/authoring/bankSearch";
import { BankSearchForm } from "./BankSearchForm";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = `/author/banks/${BANK}`;

describe("BankSearchForm", () => {
  it("searches the bank page by words, type and status, with a plain GET form", () => {
    render(<BankSearchForm bankId={BANK} view={{ kind: "all" }} filter={NO_BANK_FILTER} />);
    const form = screen.getByRole("search", { name: "Search items" });
    expect(form).toHaveAttribute("action", base);
    expect(form).toHaveAttribute("method", "get");
    expect(within(form).getByRole("searchbox", { name: "Search items" })).toHaveAttribute(
      "name",
      "q",
    );
    const type = within(form).getByRole("combobox", { name: "Type" });
    expect(type).toHaveAttribute("name", "type");
    expect(within(type).getByRole("option", { name: "Any type" })).toHaveValue("");
    expect(within(type).getByRole("option", { name: "Matrix Multiple Choice" })).toHaveValue(
      "matrix_multiple_choice",
    );
    const status = within(form).getByRole("combobox", { name: "Status" });
    expect(
      within(status)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Any status", "Draft", "Published", "Archived"]);
    expect(within(form).getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
    expect(within(form).queryByRole("link", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("keeps the folder, tags and step, and shows the current search", () => {
    const { container } = render(
      <BankSearchForm
        bankId={BANK}
        view={{ kind: "folder", id: FOLDER }}
        filter={{
          tags: ["Physiological Adaptation", "sepsis"],
          step: 2,
          query: "lactate",
          type: "bowtie",
          status: "draft",
        }}
      />,
    );
    const hidden = [...container.querySelectorAll('input[type="hidden"]')].map((input) => [
      input.getAttribute("name"),
      input.getAttribute("value"),
    ]);
    expect(hidden).toEqual([
      ["folder", FOLDER],
      ["tag", "Physiological Adaptation"],
      ["tag", "sepsis"],
      ["step", "2"],
    ]);
    expect(screen.getByRole("searchbox", { name: "Search items" })).toHaveValue("lactate");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("bowtie");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("draft");
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      `${base}?folder=${FOLDER}&tag=Physiological+Adaptation&tag=sepsis&step=2`,
    );
  });

  it("keeps Unfiled", () => {
    const { container } = render(
      <BankSearchForm bankId={BANK} view={{ kind: "unfiled" }} filter={NO_BANK_FILTER} />,
    );
    expect(container.querySelector('input[name="folder"]')).toHaveAttribute("value", "unfiled");
  });
});
