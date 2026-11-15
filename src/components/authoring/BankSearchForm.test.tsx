import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_BANK_FILTER } from "@/lib/authoring/bankSearch";
import { BankSearchForm, FILTERS_ID } from "./BankSearchForm";

/** The Filters panel: a closed popover, which the DOM still holds but marks hidden. */
const filters = () => within(document.getElementById(FILTERS_ID)!);

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = `/author/banks/${BANK}`;

describe("BankSearchForm", () => {
  it("searches the quiz page by words, type and status, with a plain GET form", () => {
    render(<BankSearchForm bankId={BANK} view={{ kind: "all" }} filter={NO_BANK_FILTER} />);
    const form = screen.getByRole("search", { name: "Search questions" });
    expect(form).toHaveAttribute("action", base);
    expect(form).toHaveAttribute("method", "get");
    expect(within(form).getByRole("searchbox", { name: "Search questions" })).toHaveAttribute(
      "name",
      "q",
    );
    // #563: Type and Status are behind Filters, inside the same form, so Search sends them.
    expect(within(form).getByRole("button", { name: "Filters" })).toHaveAttribute(
      "popovertarget",
      FILTERS_ID,
    );
    expect(form).toContainElement(document.getElementById(FILTERS_ID));
    const type = filters().getByRole("combobox", { name: "Type", hidden: true });
    expect(type).toHaveAttribute("name", "type");
    expect(within(type).getByRole("option", { name: "Any type", hidden: true })).toHaveValue("");
    expect(
      within(type).getByRole("option", { name: "Matrix multiple choice", hidden: true }),
    ).toHaveValue("matrix_multiple_choice");
    const status = filters().getByRole("combobox", { name: "Status", hidden: true });
    expect(
      within(status)
        .getAllByRole("option", { hidden: true })
        .map((option) => option.textContent),
    ).toEqual(["Any status", "Draft", "Published", "Archived"]);
    expect(within(form).getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
    expect(filters().getByRole("button", { name: "Apply filters", hidden: true })).toHaveAttribute(
      "type",
      "submit",
    );
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
    expect(screen.getByRole("searchbox", { name: "Search questions" })).toHaveValue("lactate");
    expect(filters().getByRole("combobox", { name: "Type", hidden: true })).toHaveValue("bowtie");
    expect(filters().getByRole("combobox", { name: "Status", hidden: true })).toHaveValue("draft");
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      `${base}?folder=${FOLDER}&tag=Physiological+Adaptation&tag=sepsis&step=2`,
    );
  });

  it("says how many filters are on, and holds the tag panel inside Filters", () => {
    render(
      <BankSearchForm
        bankId={BANK}
        view={{ kind: "all" }}
        filter={NO_BANK_FILTER}
        activeCount={2}
        tags={<p>Tag panel</p>}
      />,
    );
    expect(screen.getByRole("button", { name: "Filters, 2 on" })).toBeInTheDocument();
    expect(filters().getByText("Tag panel")).toBeInTheDocument();
  });

  it("names the search field's hint and keeps one compact row", () => {
    render(<BankSearchForm bankId={BANK} view={{ kind: "all" }} filter={NO_BANK_FILTER} />);
    expect(screen.getByRole("searchbox", { name: "Search questions" })).toHaveAccessibleDescription(
      "Quotes find a phrase; a minus leaves a word out.",
    );
  });

  it("keeps Not in a folder", () => {
    const { container } = render(
      <BankSearchForm bankId={BANK} view={{ kind: "unfiled" }} filter={NO_BANK_FILTER} />,
    );
    expect(container.querySelector('input[name="folder"]')).toHaveAttribute("value", "unfiled");
  });

  // #578 review: Has warnings is a link, not a field, so Search must carry it or drop the filter.
  it("keeps Has warnings on through a search", () => {
    const { container, unmount } = render(
      <BankSearchForm
        bankId={BANK}
        view={{ kind: "all" }}
        filter={{ ...NO_BANK_FILTER, warnings: true }}
      />,
    );
    expect(container.querySelector('input[name="warnings"]')).toHaveAttribute("value", "1");
    unmount();
    const off = render(
      <BankSearchForm bankId={BANK} view={{ kind: "all" }} filter={NO_BANK_FILTER} />,
    );
    expect(off.container.querySelector('input[name="warnings"]')).toBeNull();
  });
});
