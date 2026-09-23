import { render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreInProcess, scoreSubmission } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { BowtieItem } from "./bowtie/BowtieItem";
import { DragdropClozeItem } from "./dragdrop_cloze/DragdropClozeItem";
import { DragdropRationaleItem } from "./dragdrop_rationale/DragdropRationaleItem";
import { HighlightTableItem } from "./highlight_table/HighlightTableItem";
import { HighlightTextItem } from "./highlight_text/HighlightTextItem";
import { OrderedResponseItem } from "./ordered_response/OrderedResponseItem";
import { renderersLoaded } from "@/components/question/testing/renderers";
import type { ItemRendererProps, PlayerMode } from "./types";

// #49: the six pointer-heavy renderers put each element's explanation where the element is, and
// point the element at it with aria-describedby, as #39 did for options, matrix rows and blanks.

const parse = (input: unknown) => itemSchema.parse(input);
const md = (value: string) => ({ kind: "markdown" as const, value });

/** The item already checked: straight into feedback with the given answer. */
async function checked(item: Item, response: AnyResponse) {
  render(
    <ItemPlayer
      item={item}
      submit={scoreInProcess(item)}
      initialResponse={response}
      initialReveal={scoreSubmission(item, response)}
    />,
  );
  await renderersLoaded();
}

/** The same answer, still open. */
async function open(item: Item, response: AnyResponse) {
  render(<ItemPlayer item={item} submit={scoreInProcess(item)} initialResponse={response} />);
  await renderersLoaded();
}

const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** aria-describedby must resolve, and every id must be unique on the page. */
function expectIdsSound() {
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const element of document.querySelectorAll("[aria-describedby]")) {
    for (const id of element.getAttribute("aria-describedby")!.split(" ")) {
      expect(document.getElementById(id), `#${id}`).not.toBeNull();
    }
  }
}

describe("highlight text", () => {
  const item = parse(FIXTURES.highlight_text.canonical);
  const response: AnyResponse = { type: "highlight_text", spanIds: ["sp_hr", "sp_bp"] };
  const span = (name: RegExp) => screen.getByRole("button", { name });

  it("explains each span after the sentence it sits in, and the span points at it", async () => {
    await checked(item, response);
    const hr = span(/Heart rate 54/);
    const bp = span(/Blood pressure 128\/78/);
    expect(hr).toHaveAccessibleDescription(/reached the conduction system/);
    expect(bp).toHaveAccessibleDescription(/within the expected range/);
    // Missed and unselected spans are explained too.
    expect(span(/Urine output 15 mL/)).toHaveAccessibleDescription(/under-perfused/);
    expect(span(/Skin warm and dry/)).toHaveAccessibleDescription(/does not suggest poor/);

    // Beside the element: after the sentence holding the span, before the next finding.
    const why = screen.getByText(/reached the conduction system/);
    expect(follows(hr, why)).toBe(true);
    expect(follows(why, bp)).toBe(true);
    // The sentence is not broken: it ends, full stop included, before the explanation starts.
    const sentence = hr.closest("p")!;
    expect(sentence.contains(why)).toBe(false);
    expect(sentence.textContent).toMatch(/Heart rate 54 and irregular.*\.$/);
    expect(follows(sentence, why)).toBe(true);
    expectIdsSound();
  });

  it("explains nothing while the item is open", async () => {
    await open(item, response);
    expect(screen.queryByText(/reached the conduction system/)).toBeNull();
    expect(span(/Heart rate 54/)).toHaveAccessibleDescription("");
  });
});

describe("highlight table", () => {
  const item = parse(FIXTURES.highlight_table.canonical);
  const response: AnyResponse = { type: "highlight_table", spanIds: ["g1", "s3"] };

  it("explains each span beneath its own cell, in the grid and in the row cards", async () => {
    await checked(item, response);
    const grid = screen.getByRole("table");
    const lethargic = within(grid).getByRole("button", { name: /Lethargic/ });
    expect(lethargic).toHaveAccessibleDescription(/brain is under-perfused/);
    const cell = lethargic.closest("td")!;
    expect(within(cell).getByText(/brain is under-perfused/)).toBeInTheDocument();
    // Two spans in one cell: each explanation says which span it is about.
    expect(within(cell).getByText(/Having no fever/)).toBeInTheDocument();

    const card = screen.getByRole("group", { name: "Skin and mucous membranes" });
    const rash = within(card).getByRole("button", { name: /no rash/ });
    expect(rash).toHaveAccessibleDescription(/says nothing about the child's fluid status/);
    expect(within(card).getByText(/says nothing about the child's fluid status/)).toBeVisible();
    expectIdsSound();
  });

  it("explains nothing while the item is open", async () => {
    await open(item, response);
    expect(screen.queryByText(/brain is under-perfused/)).toBeNull();
    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /Lethargic/ }),
    ).toHaveAccessibleDescription("");
  });
});

describe("drag-and-drop cloze", () => {
  const item = parse(FIXTURES.dragdrop_cloze.canonical);
  const response: AnyResponse = {
    type: "dragdrop_cloze",
    blanks: [
      { blankId: "blank_1", tokenId: "tok_ics" },
      { blankId: "blank_2", tokenId: "tok_fowler" },
    ],
  };

  it("explains what belongs in each blank, and the blank points at it", async () => {
    await checked(item, response);
    const first = screen.getByRole("button", { name: /^Blank 1 of 2/ });
    expect(first).toHaveAccessibleDescription(/opens the airways within minutes/);
    expect(screen.getByRole("button", { name: /^Blank 2 of 2/ })).toHaveAccessibleDescription(
      /lets the diaphragm drop/,
    );
    // After the sentence, never inside it, so the sentence still reads as one.
    const why = screen.getByText(/opens the airways within minutes/);
    expect(follows(first, why)).toBe(true);
    expect(first.closest("p")!.contains(why)).toBe(false);
    expectIdsSound();
  });

  it("explains nothing while the item is open", async () => {
    await open(item, response);
    expect(screen.queryByText(/opens the airways within minutes/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Blank 1 of 2/ })).toHaveAccessibleDescription("");
  });
});

describe("drag-and-drop rationale", () => {
  const item = parse(FIXTURES.dragdrop_rationale.canonical);
  const response: AnyResponse = {
    type: "dragdrop_rationale",
    blanks: [
      { blankId: "cond", tokenId: "tok_atelectasis" },
      { blankId: "cause", tokenId: "tok_immobility" },
    ],
  };

  it("explains each blank of a dyad", async () => {
    await checked(item, response);
    expect(screen.getByRole("button", { name: /^Blank 2 of 2/ })).toHaveAccessibleDescription(
      /Splinting the incision keeps each breath shallow/,
    );
    expectIdsSound();
  });

  it("describes a triad's anchor with both its tag and its explanation", async () => {
    const edge = FIXTURES.dragdrop_rationale.edge;
    const triad = parse({
      ...edge,
      rationale: { ...edge.rationale, perElement: { cond: md("The clot comes first.") } },
    });
    await checked(triad, {
      type: "dragdrop_rationale",
      blanks: [
        { blankId: "cond", tokenId: "t_dvt" },
        { blankId: "ev1", tokenId: "t_calf" },
        { blankId: "ev2", tokenId: "t_fever" },
      ],
    });
    expect(screen.getByRole("button", { name: /^Blank 1 of 3/ })).toHaveAccessibleDescription(
      "Anchor The clot comes first.",
    );
    expectIdsSound();
  });

  it("explains nothing while the item is open", async () => {
    await open(item, response);
    expect(screen.queryByText(/Splinting the incision/)).toBeNull();
  });
});

describe("ordered response", () => {
  const item = parse(FIXTURES.ordered_response.canonical);
  const response: AnyResponse = {
    type: "ordered_response",
    orderedIds: ["act_cpr", "act_help", "act_aed", "act_rhythm", "act_shock"],
  };
  const step = (label: string) =>
    within(screen.getByRole("list", { name: "Steps in order" }))
      .getAllByRole("listitem")
      .find((li) => li.dataset.label === label)!;

  it("explains each step under the step, in the order the student gave", async () => {
    await checked(item, response);
    const cpr = step("Begin chest compressions");
    expect(within(cpr).getByText(/every minute without them/)).toBeInTheDocument();
    expect(cpr).toHaveAccessibleDescription(/every minute without them/);
    const help = step("Call for help and activate the emergency response");
    expect(help).toHaveAccessibleDescription(/brings a defibrillator and more hands/);
    expect(follows(cpr, help)).toBe(true);
    expectIdsSound();
  });

  it("explains nothing while the item is open", async () => {
    await open(item, response);
    expect(screen.queryByText(/every minute without them/)).toBeNull();
    expect(step("Begin chest compressions")).not.toHaveAttribute("aria-describedby");
  });
});

describe("bowtie", () => {
  const item = parse(FIXTURES.bowtie.canonical);
  const response: AnyResponse = {
    type: "bowtie",
    actionIds: ["act_ecg", "act_walk"],
    conditionId: "cond_mi",
    parameterIds: ["par_troponin", "par_bowel"],
  };
  const column = (name: string) => screen.getByRole("region", { name });

  it("explains the choice in each slot, beneath its own column, and the slot points at it", async () => {
    await checked(item, response);
    const walk = screen.getByRole("button", { name: /^Actions to Take 2 of 2: Encourage/ });
    expect(walk).toHaveAccessibleDescription(/raises the heart's oxygen demand/);
    expect(
      screen.getByRole("button", { name: /^Potential Condition: Acute myocardial/ }),
    ).toHaveAccessibleDescription(/an acute MI until proved otherwise/);
    expect(within(column("Actions to Take")).getByText(/oxygen demand/)).toBeInTheDocument();
    expect(follows(walk, screen.getByText(/oxygen demand/))).toBe(true);
    // The right choice the student left out is explained where it is named.
    expect(within(column("Actions to Take")).getByText(/inhibits platelets/)).toBeInTheDocument();
    expect(
      within(column("Parameters to Monitor")).getByText(/say nothing about the heart/),
    ).toBeInTheDocument();
    expectIdsSound();
  });

  it("leaves a bowtie with no per-choice rationale as it was", async () => {
    const edge = parse(FIXTURES.bowtie.edge);
    await checked(edge, {
      type: "bowtie",
      actionIds: ["a1", "a3"],
      conditionId: "c1",
      parameterIds: ["p1", "p2"],
    });
    expect(
      screen.getByRole("button", { name: /^Potential Condition: Subarachnoid/ }),
    ).toHaveAccessibleDescription("");
  });

  it("explains nothing while the item is open", async () => {
    await open(item, response);
    expect(screen.queryByText(/oxygen demand/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Actions to Take 2 of 2: Encourage/ }),
    ).toHaveAccessibleDescription("");
  });
});

// The player never hands a renderer the rationale before feedback. Each renderer also refuses to
// show one it is handed outside feedback, so the explanation cannot leak if that ever changes.
describe("a renderer handed rationale outside feedback", () => {
  const cases: [string, ComponentType<ItemRendererProps<never>>, Item, AnyResponse, RegExp][] = [
    [
      "highlight text",
      HighlightTextItem as never,
      parse(FIXTURES.highlight_text.canonical),
      { type: "highlight_text", spanIds: ["sp_hr"] },
      /conduction system/,
    ],
    [
      "highlight table",
      HighlightTableItem as never,
      parse(FIXTURES.highlight_table.canonical),
      { type: "highlight_table", spanIds: ["g1"] },
      /under-perfused/,
    ],
    [
      "drag-and-drop cloze",
      DragdropClozeItem as never,
      parse(FIXTURES.dragdrop_cloze.canonical),
      { type: "dragdrop_cloze", blanks: [{ blankId: "blank_1", tokenId: "tok_saba" }] },
      /opens the airways/,
    ],
    [
      "drag-and-drop rationale",
      DragdropRationaleItem as never,
      parse(FIXTURES.dragdrop_rationale.canonical),
      { type: "dragdrop_rationale", blanks: [{ blankId: "cond", tokenId: "tok_pe" }] },
      /point to atelectasis/,
    ],
    [
      "ordered response",
      OrderedResponseItem as never,
      parse(FIXTURES.ordered_response.canonical),
      {
        type: "ordered_response",
        orderedIds: ["act_help", "act_cpr", "act_aed", "act_rhythm", "act_shock"],
      },
      /every minute without them/,
    ],
    [
      "bowtie",
      BowtieItem as never,
      parse(FIXTURES.bowtie.canonical),
      { type: "bowtie", actionIds: ["act_ecg"], conditionId: "cond_mi", parameterIds: [] },
      /oxygen demand|inhibits platelets|until proved otherwise/,
    ],
  ];

  it.each(
    cases.flatMap(([name, ...rest]) =>
      (["answer", "review"] as PlayerMode[]).map(
        (mode) => [`${name} in ${mode}`, mode, ...rest] as const,
      ),
    ),
  )("%s shows none of it", (_name, mode, Renderer, item, response, text) => {
    render(
      <Renderer
        item={item as never}
        response={response as never}
        mode={mode}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(text)).toBeNull();
    // dnd-kit describes its draggables with usage hints; nothing may describe an element with this.
    for (const element of document.querySelectorAll("[aria-describedby]")) {
      expect(element).not.toHaveAccessibleDescription(text);
    }
  });
});
