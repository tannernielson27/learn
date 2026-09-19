import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_FILTER, tagFacets, type TaggedRow, type TagFilter } from "@/lib/authoring/tagFilter";
import { TagFilterBar } from "./TagFilterBar";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = `/author/banks/${BANK}`;

const rows: TaggedRow[] = [
  { tags: ["Physiological Adaptation", "sepsis"], cjmmStep: 1 },
  { tags: ["Physiological Adaptation", "renal"], cjmmStep: 1 },
  { tags: ["sepsis"], cjmmStep: null },
];

function setup(
  filter: TagFilter,
  view: Parameters<typeof TagFilterBar>[0]["view"] = { kind: "all" },
) {
  render(
    <TagFilterBar bankId={BANK} view={view} filter={filter} facets={tagFacets(rows, filter)} />,
  );
  return screen.getByRole("region", { name: "Filter by tag" });
}

describe("TagFilterBar", () => {
  it("offers each step, client need and topic as a link with its count, in groups", () => {
    const bar = setup(NO_FILTER);
    const step = within(
      within(bar).getByRole("group", { name: "Clinical judgment step" }),
    ).getByRole("link");
    expect(step).toHaveAccessibleName("Step 1: Recognize Cues, 2 items");
    expect(step).toHaveAttribute("href", `${base}?step=1`);

    const needs = within(bar).getByRole("group", { name: "Client needs" });
    expect(within(needs).getByRole("link")).toHaveAccessibleName(
      "Physiological Adaptation, 2 items",
    );

    const topics = within(within(bar).getByRole("group", { name: "Topics" })).getAllByRole("link");
    expect(topics.map((link) => link.getAttribute("href"))).toEqual([
      `${base}?tag=sepsis`,
      `${base}?tag=renal`,
    ]);
    expect(topics[1]).toHaveAccessibleName("renal, 1 item");
    expect(within(bar).queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("adds a tag to the chosen ones, keeping the folder, and marks chosen tags for removal", () => {
    const bar = setup(
      { tags: ["Physiological Adaptation"], step: null },
      { kind: "folder", id: FOLDER },
    );
    const chosen = within(bar).getByRole("link", {
      name: "Remove filter Physiological Adaptation, 2 items",
    });
    expect(chosen).toHaveAttribute("href", `${base}?folder=${FOLDER}`);
    expect(chosen).toHaveAttribute("aria-current", "true");
    expect(within(bar).getByRole("link", { name: "sepsis, 1 item" })).toHaveAttribute(
      "href",
      `${base}?folder=${FOLDER}&tag=Physiological+Adaptation&tag=sepsis`,
    );
  });

  it("says how many items carry every chosen tag, and clears them in one step", () => {
    const bar = setup({ tags: ["Physiological Adaptation", "sepsis"], step: null });
    expect(bar).toHaveTextContent("1 item has all of: Physiological Adaptation, sepsis.");
    expect(within(bar).getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", base);
  });

  it("says when the list shows fewer items than the filter matches", () => {
    render(
      <TagFilterBar
        bankId={BANK}
        view={{ kind: "all" }}
        filter={{ tags: ["sepsis"], step: null }}
        facets={tagFacets(rows, { tags: ["sepsis"], step: null })}
        listLimit={1}
      />,
    );
    expect(screen.getByRole("region", { name: "Filter by tag" })).toHaveTextContent(
      "The list shows the 1 most recently edited.",
    );
  });

  it("names the step among what the items have", () => {
    const bar = setup({ tags: [], step: 1 });
    expect(bar).toHaveTextContent("2 items have all of: Step 1: Recognize Cues.");
  });

  it("shows nothing when no item in view has a tag or step", () => {
    const { container } = render(
      <TagFilterBar
        bankId={BANK}
        view={{ kind: "all" }}
        filter={NO_FILTER}
        facets={tagFacets([{ tags: [], cjmmStep: null }], NO_FILTER)}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
