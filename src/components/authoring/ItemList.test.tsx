import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemList } from "./ItemList";

const items = [
  {
    id: "i1",
    type: "multiple_response",
    status: "draft" as const,
    stemExcerpt: "Which findings need follow-up?",
    maxPoints: 3,
    updatedAt: "2026-09-12T15:00:00Z",
    cjmmStep: 3,
    tags: ["sepsis", "Physiological Adaptation"],
    match: null,
    warningCount: 2,
  },
  {
    id: "i2",
    type: "matrix_multiple_choice",
    status: "published" as const,
    stemExcerpt: "",
    maxPoints: null,
    updatedAt: "2026-09-11T08:00:00Z",
    cjmmStep: null,
    tags: [],
    match: null,
    warningCount: 0,
  },
];

const base = items[0]!;
const seg = (text: string, match = false) => ({ text, match });

describe("ItemList", () => {
  it("links each item to its editor by stem, with type, status and last edit", () => {
    render(<ItemList items={items} />);
    const first = screen.getByRole("link", { name: /Which findings need follow-up\?/ });
    expect(first).toHaveAttribute("href", "/author/items/i1");
    expect(within(first).getByText("Extended Multiple Response")).toBeInTheDocument();
    expect(within(first).getByText("Draft")).toBeInTheDocument();
    expect(within(first).getByText("Edited Sep 12, 2026")).toBeInTheDocument();
  });

  it("shows an item's CJMM step as a tag, then its client needs, then its topics", () => {
    render(<ItemList items={items} />);
    const first = screen.getByRole("link", { name: /Which findings need follow-up\?/ });
    const tags = within(first).getByRole("list", { name: "Tags" });
    expect(
      within(tags)
        .getAllByRole("listitem")
        .map((tag) => tag.textContent),
    ).toEqual(["Step 3: Prioritize Hypotheses", "Physiological Adaptation", "sepsis"]);
    const untitled = screen.getByRole("link", { name: /^Untitled item/ });
    expect(within(untitled).queryByRole("list", { name: "Tags" })).not.toBeInTheDocument();
  });

  it("says how many quality warnings an item has, and nothing when it has none", () => {
    render(<ItemList items={[...items, { ...items[0], id: "i3", warningCount: 1 }]} />);
    const [first, second, third] = screen.getAllByRole("link", {
      name: /^(Which findings|Untitled)/,
    });
    expect(first).toHaveAccessibleName(/2 warnings/);
    expect(within(third).getByText("1 warning")).toBeInTheDocument();
    expect(within(second).queryByText(/warning/)).not.toBeInTheDocument();
  });

  it("names an item with no stem yet", () => {
    render(<ItemList items={items} />);
    // Anchored: the published item's Play link is named "Play Untitled item".
    const second = screen.getByRole("link", { name: /^Untitled item/ });
    expect(within(second).getByText("Matrix Multiple Choice")).toBeInTheDocument();
    expect(within(second).getByText("Published")).toBeInTheDocument();
  });

  it("offers Play for a published item only, named for the item", () => {
    render(<ItemList items={items} />);
    expect(screen.getByRole("link", { name: "Play Untitled item" })).toHaveAttribute(
      "href",
      "/author/items/i2/play",
    );
    expect(screen.queryByRole("link", { name: /^Play Which findings/ })).not.toBeInTheDocument();
  });

  it("shows each item's points, and none while scoring is not set", () => {
    render(<ItemList items={[...items, { ...items[0], id: "i3", maxPoints: 1 }]} />);
    const [first, , third] = screen.getAllByRole("link", { name: /^(Which findings|Untitled)/ });
    expect(within(first).getByText("3 points")).toBeInTheDocument();
    expect(within(third).getByText("1 point")).toBeInTheDocument();
    const untitled = screen.getByRole("link", { name: /^Untitled item/ });
    expect(within(untitled).queryByText(/point/)).not.toBeInTheDocument();
  });

  it("falls back to the raw type for an unknown one rather than crashing", () => {
    render(<ItemList items={[{ ...items[0], type: "future_type" }]} />);
    expect(screen.getByText("future_type")).toBeInTheDocument();
  });

  it("says what to do when the bank is empty", () => {
    render(<ItemList items={[]} />);
    expect(
      screen.getByText("No items in this bank yet. Choose New item to write one."),
    ).toBeInTheDocument();
  });

  it("says so when a folder holds no items", () => {
    render(<ItemList items={[]} emptyMessage="No items in this folder." />);
    expect(screen.getByText("No items in this folder.")).toBeInTheDocument();
  });

  it("offers no selection unless there is a move form to join", () => {
    render(<ItemList items={items} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("lets each item be selected for a move, outside its link, named for the item", () => {
    render(<ItemList items={items} moveFormId="move-form" />);
    const first = screen.getByRole("checkbox", { name: "Select Which findings need follow-up?" });
    expect(first).toHaveAttribute("form", "move-form");
    expect(first).toHaveAttribute("name", "item");
    expect(first).toHaveAttribute("value", "i1");
    expect(first.closest("a")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select Untitled item" })).toHaveAttribute(
      "value",
      "i2",
    );
  });

  it("marks the matched words of a stem, and renders item text as text, never as HTML", () => {
    const { container } = render(
      <ItemList
        items={[
          {
            ...base,
            stemExcerpt: "A rising lactate <img src=x onerror=boom>",
            match: {
              stem: [seg("A rising "), seg("lactate", true), seg(" <img src=x onerror=boom>")],
              text: null,
              rationale: false,
            },
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /A rising lactate/ });
    const marks = link.querySelectorAll("mark");
    expect([...marks].map((mark) => mark.textContent)).toEqual(["lactate"]);
    // The list drops markdown marks such as ">", as the plain excerpt does; the rest is text.
    expect(link).toHaveTextContent("A rising lactate <img src=x onerror=boom");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows a snippet of the rest of the item when only it matched", () => {
    render(
      <ItemList
        items={[
          {
            ...base,
            stemExcerpt: "Which action comes first?",
            match: {
              stem: null,
              text: [seg("Recheck the serum "), seg("lactate", true)],
              rationale: false,
            },
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /Which action comes first\?/ });
    expect(link).toHaveTextContent("In the item: Recheck the serum lactate");
    expect(link.querySelector("mark")).toHaveTextContent("lactate");
  });

  it("says when only the rationale matched, without showing it", () => {
    render(<ItemList items={[{ ...base, match: { stem: null, text: null, rationale: true } }]} />);
    expect(screen.getByRole("link", { name: /Which findings need follow-up\?/ })).toHaveTextContent(
      "Matched in the rationale",
    );
  });

  it("offers Restore on each archived item, named for the item, outside its link", () => {
    const archived = items.map((item) => ({ ...item, status: "archived" as const }));
    const restoreAction = vi.fn((id: string) => async () => {
      void id;
      return { status: "idle" as const };
    });
    render(<ItemList items={archived} restoreAction={restoreAction} />);
    const restore = screen.getByRole("button", { name: "Restore Which findings need follow-up?" });
    expect(restore).toHaveTextContent("Restore");
    expect(restore.closest("a")).toBeNull();
    expect(screen.getByRole("button", { name: "Restore Untitled item" })).toBeInTheDocument();
    expect(restoreAction).toHaveBeenCalledWith("i1");
    expect(restoreAction).toHaveBeenCalledWith("i2");
    expect(screen.queryByRole("link", { name: /^Play/ })).not.toBeInTheDocument();
  });

  it("offers no Restore without a restore action", () => {
    render(<ItemList items={items} />);
    expect(screen.queryByRole("button", { name: /^Restore/ })).not.toBeInTheDocument();
  });
});
