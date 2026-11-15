import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_BANK_FILTER, type BankFilter } from "@/lib/authoring/bankSearch";
import { ActiveFilters, activeFilterCount } from "./ActiveFilters";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = `/author/banks/${BANK}`;

function draw(filter: Partial<BankFilter>, matching = 1) {
  render(
    <ActiveFilters
      bankId={BANK}
      view={{ kind: "folder", id: FOLDER }}
      filter={{ ...NO_BANK_FILTER, ...filter }}
      matching={matching}
    />,
  );
  return screen.queryByRole("region", { name: "Active filters" });
}

describe("ActiveFilters (#563)", () => {
  it("shows nothing when nothing is filtered, a search alone included", () => {
    expect(draw({ query: "lactate" })).toBeNull();
    expect(activeFilterCount({ ...NO_BANK_FILTER, query: "lactate" })).toBe(0);
  });

  it("leaves the Archived view out: it is the Current or archived switch", () => {
    expect(draw({ status: "archived" })).toBeNull();
  });

  it("draws each filter as a chip that takes it off, keeping the folder and the search", () => {
    const region = draw({
      query: "lactate",
      type: "bowtie",
      status: "published",
      step: 2,
      tags: ["sepsis"],
      warnings: true,
    })!;
    const chips = within(region)
      .getAllByRole("link", { name: /^Remove filter / })
      .map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")]);
    const kept = `folder=${FOLDER}`;
    expect(chips).toEqual([
      [
        "Remove filter Bowtie",
        `${base}?${kept}&tag=sepsis&step=2&warnings=1&q=lactate&status=published`,
      ],
      [
        "Remove filter Published",
        `${base}?${kept}&tag=sepsis&step=2&warnings=1&q=lactate&type=bowtie`,
      ],
      [
        "Remove filter Step 2: Analyze Cues",
        `${base}?${kept}&tag=sepsis&warnings=1&q=lactate&type=bowtie&status=published`,
      ],
      [
        "Remove filter sepsis",
        `${base}?${kept}&step=2&warnings=1&q=lactate&type=bowtie&status=published`,
      ],
      [
        "Remove filter Has warnings",
        `${base}?${kept}&tag=sepsis&step=2&q=lactate&type=bowtie&status=published`,
      ],
    ]);
    expect(activeFilterCount({ ...NO_BANK_FILTER, type: "bowtie", tags: ["a", "b"] })).toBe(3);
  });

  it("clears every filter in one step and keeps the words searched for", () => {
    const region = draw({ query: "lactate", type: "bowtie", tags: ["sepsis"] })!;
    expect(within(region).getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      `${base}?folder=${FOLDER}&q=lactate`,
    );
  });

  it("says how many questions carry every chosen tag", () => {
    const region = draw({ tags: ["Physiological Adaptation", "sepsis"] }, 1)!;
    expect(region).toHaveTextContent("1 question has all of: Physiological Adaptation, sepsis.");
  });

  it("names the step and Has warnings among what the questions have", () => {
    const stepped = draw({ step: 1, warnings: true }, 2);
    expect(stepped).toHaveTextContent(
      "2 questions have all of: Step 1: Recognize Cues, Has warnings.",
    );
  });

  it("says nothing about tags for a type or status alone", () => {
    const region = draw({ type: "bowtie" })!;
    expect(region).not.toHaveTextContent("all of");
  });
});
