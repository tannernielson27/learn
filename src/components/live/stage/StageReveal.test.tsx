import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item, type ItemType } from "@/lib/ngn/schemas";
import { StageReveal } from "./StageReveal";
import { stageKey } from "./stageKey";

/**
 * The answer on the projector. jsdom cannot lay it out, so the fit itself is `stageFit.test.ts`;
 * these pin what is drawn: the chart with every option's whole text, the key view for every other
 * layout with its wrong choices readable, and the rules the layout rests on.
 */

const PLACE = { position: 3, itemCount: 20, label: "Question 3 of 20", caseStep: null };

const RATIONALE =
  "Sudden dyspnea, pleuritic pain and hypoxemia after hip surgery suggest a pulmonary embolism. " +
  "Raise the head of the bed, give oxygen and call the provider at once. ".repeat(6);

const parse = (type: ItemType): Item => itemSchema.parse(FIXTURES[type].canonical) as Item;

function draw() {
  render(
    <StageReveal
      place={PLACE}
      answers={{ responded: 60, present: 70 }}
      question={null}
      rows={[
        { letter: "A", label: "Raise the head of the bed", count: 40, isKey: true },
        { letter: "B", label: "Encourage fluids", count: 20 },
      ]}
      total={60}
      keyed={null}
      rationale={{ kind: "markdown", value: RATIONALE }}
    />,
  );
}

/** The key view for an item, as the stage draws it once the answer is showing. */
async function drawKey(item: Item) {
  render(
    <StageReveal
      place={PLACE}
      answers={null}
      question={{ stem: item.stem, options: null }}
      rows={null}
      total={0}
      keyed={stageKey(item, true)}
      rationale={item.rationale.general ?? null}
    />,
  );
  const key = await screen.findByTestId("stage-key");
  // The renderer arrives in its own chunk.
  await waitFor(() => expect(within(key).getAllByText("Correct").length).toBeGreaterThan(0));
  return key;
}

describe("StageReveal: a long rationale on a short projector", () => {
  it("clamps the rationale to about four lines and lets it give way", () => {
    draw();
    const rationale = screen.getByTestId("stage-rationale");
    expect(rationale).toHaveClass("line-clamp-4", "min-h-0", "shrink-[100]");
    expect(rationale).not.toHaveClass("shrink-0");
  });

  it("gives the chart a floor, so every bar shows whatever the rationale holds", () => {
    draw();
    const chart = screen.getByRole("list", { name: "How the class answered" });
    expect(chart.closest("[data-testid=stage-fit]")).toHaveClass("flex-auto", "min-h-[45cqb]");
    expect(screen.getAllByTestId("results-bar")).toHaveLength(2);
  });

  it("gives a long chart the whole wall: the question steps aside and the rows are compact", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      letter: String.fromCharCode(65 + index),
      label: `Option ${index + 1}`,
      count: index,
    }));
    render(
      <StageReveal
        place={PLACE}
        answers={null}
        question={{ stem: { kind: "markdown", value: "Which actions?" }, options: null }}
        rows={rows}
        total={15}
        keyed={null}
        rationale={null}
      />,
    );
    expect(screen.getByTestId("stage-reveal-stem")).toHaveClass("hidden");
    expect(screen.getAllByTestId("results-bar")).toHaveLength(6);
  });
});

describe("StageReveal: multiple choice with long options", () => {
  it("names the correct options with their whole text, never cut", () => {
    const long = (words: string) =>
      `${words}, documenting the finding and reporting it to the provider before the next dose is due`;
    const rows = [
      { letter: "A", label: long("Assess the apical pulse for one full minute"), count: 9 },
      {
        letter: "B",
        label: long("Hold the dose and recheck the potassium level"),
        count: 30,
        isKey: true,
      },
      { letter: "C", label: long("Give the dose with food to limit nausea"), count: 4 },
      {
        letter: "D",
        label: long("Ask the client to report any visual changes"),
        count: 12,
        isKey: true,
      },
      { letter: "E", label: long("Encourage oral fluids through the shift"), count: 2 },
    ];
    render(
      <StageReveal
        place={PLACE}
        answers={{ responded: 57, present: 60 }}
        question={{ stem: { kind: "markdown", value: "Which actions?" }, options: null }}
        rows={rows}
        total={57}
        keyed={null}
        rationale={null}
      />,
    );
    const keyRows = screen.getAllByRole("listitem").filter((row) => row.hasAttribute("data-key"));
    expect(keyRows).toHaveLength(2);
    expect(keyRows[0]).toHaveTextContent(rows[1]!.label);
    expect(keyRows[0]).toHaveTextContent("Correct");
    expect(keyRows[1]).toHaveTextContent(rows[3]!.label);
    expect(
      screen.getByRole("list", { name: "How the class answered" }).querySelector(".truncate"),
    ).toBeNull();
    expect(screen.getAllByTestId("results-bar")).toHaveLength(5);
  });
});

describe("StageReveal: the key for every other layout", () => {
  it("fills the bowtie with its key and lists the other choices as not correct", async () => {
    const bowtie = parse("bowtie");
    const key = await drawKey(bowtie);
    // Two actions, the condition and two parameters, each in its slot and marked Correct.
    expect(within(key).getAllByText("Correct")).toHaveLength(5);
    for (const label of [
      "Obtain a 12-lead ECG within 10 minutes",
      "Acute myocardial infarction",
      "Serial troponin levels",
    ]) {
      expect(within(key).getByRole("button", { name: new RegExp(label) })).toBeDisabled();
    }
    const wrong = within(key).getByTestId("stage-not-correct");
    const conditions = within(wrong).getByRole("list", {
      name: "Not correct: Potential Condition",
    });
    expect(
      within(conditions)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([
      "Not correct: Gastroesophageal reflux",
      "Not correct: Costochondritis",
      "Not correct: Panic attack",
    ]);
    expect(within(wrong).getAllByRole("listitem")).toHaveLength(9);
    expect(within(wrong).queryByText("Acute myocardial infarction")).toBeNull();
    // The question is drawn with its key, inside the part that is fitted to the wall.
    expect(key).toHaveTextContent("crushing substernal chest pain");
    expect(screen.queryByTestId("stage-reveal-stem")).toBeNull();
  });

  it("marks a matrix's right cells and keeps every other cell readable", async () => {
    const matrix = parse("matrix_multiple_choice");
    if (matrix.type !== "matrix_multiple_choice") throw new Error("matrix");
    const key = await drawKey(matrix);
    // The grid and the row cards (the phone's form) are both in the page; each marks every row.
    expect(within(key).getAllByText("Correct")).toHaveLength(matrix.content.rows.length * 2);
    for (const row of matrix.content.rows) expect(key).toHaveTextContent(row.label);
    expect(within(key).queryByText("Incorrect")).toBeNull();
    expect(within(key).queryByText("Missed")).toBeNull();
  });

  it("fills a drop-down cloze with its right words and lists the other choices", async () => {
    const cloze = parse("dropdown_cloze");
    const key = await drawKey(cloze);
    const blanks = within(key).getAllByRole("combobox");
    expect(
      blanks.map((blank) => (blank as HTMLSelectElement).selectedOptions[0]?.textContent),
    ).toEqual(["cardiac dysrhythmia", "obtain a 12-lead ECG"]);
    const wrong = within(key).getByTestId("stage-not-correct");
    expect(within(wrong).getByRole("list", { name: "Not correct: Blank 1" })).toHaveTextContent(
      "seizure activity",
    );
    expect(wrong).not.toHaveTextContent("cardiac dysrhythmia");
  });

  it("is read-only: inert, so nothing in it takes focus and the stage keeps its keys", async () => {
    const key = await drawKey(parse("dropdown_cloze"));
    expect(key).toHaveAttribute("inert");
    expect(within(key).queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("leaves the rationale to the stage, clamped under the key, and no sample tag", async () => {
    const bowtie = parse("bowtie");
    const key = await drawKey(bowtie);
    expect(key).not.toHaveTextContent("Sample");
    // The per-choice explanations stay on the phones.
    expect(key).not.toHaveTextContent("Walking raises the heart's oxygen demand");
    expect(screen.getByTestId("stage-rationale")).toHaveClass("line-clamp-2", "shrink-[100]");
    expect(screen.getByTestId("stage-key").closest("[data-testid=stage-fit]")).toHaveClass(
      "min-h-[55cqb]",
      "flex-auto",
    );
  });

  it("draws a key for every item type", async () => {
    for (const type of Object.keys(FIXTURES) as ItemType[]) {
      const { unmount } = render(
        <StageReveal
          place={PLACE}
          answers={null}
          question={null}
          rows={null}
          total={0}
          keyed={parse(type)}
          rationale={null}
        />,
      );
      const key = await screen.findByTestId("stage-key");
      // Every type marks its keyed elements with the word, some inside a sentence (", Correct").
      await waitFor(() => expect(key, type).toHaveTextContent(/Correct/));
      expect(key, type).not.toHaveTextContent(/Incorrect|Missed/);
      unmount();
    }
  });
});

describe("StageReveal: no key before the reveal", () => {
  it("draws no key view and no mark while the stage has no key", () => {
    const bowtie = parse("bowtie");
    render(
      <StageReveal
        place={PLACE}
        answers={null}
        question={{ stem: bowtie.stem, options: null }}
        rows={null}
        total={0}
        keyed={stageKey(bowtie, false)}
        rationale={null}
      />,
    );
    expect(screen.queryByTestId("stage-key")).toBeNull();
    expect(document.body).not.toHaveTextContent("Correct");
    expect(document.body).not.toHaveTextContent("Acute myocardial infarction");
  });
});
