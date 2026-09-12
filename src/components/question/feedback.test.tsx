import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { ItemPlayer, toPlayerItem } from "./ItemPlayer";

const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const sata = itemSchema.parse(FIXTURES.multiple_response.canonical);
const matrix = itemSchema.parse(FIXTURES.matrix_multiple_choice.canonical);
const matrixMr = itemSchema.parse(FIXTURES.matrix_multiple_response.canonical);
const rationale = itemSchema.parse(FIXTURES.dropdown_rationale.canonical);
const noPerElement = itemSchema.parse(FIXTURES.multiple_choice.edge);

const submit = () => screen.getByRole("button", { name: "Submit" });
const breakdown = () => screen.getByRole("complementary", { name: "Breakdown" });

describe("the answer key and its explanations", () => {
  it("keeps the rationale away from the renderer until feedback", () => {
    // perElement says which option is wrong and why, so before feedback it is a key by another name.
    expect("rationale" in toPlayerItem(mc, "answer")).toBe(false);
    expect("rationale" in toPlayerItem(mc, "review")).toBe(false);
    expect("rationale" in toPlayerItem(mc, "feedback")).toBe(true);
  });

  it("shows no per-element rationale while the item is still being answered", async () => {
    render(<ItemPlayer item={mc} />);
    expect(screen.queryByText(/Assessment comes first/)).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Encourage the client/ }));
    expect(screen.queryByText(/More fluid worsens/)).toBeNull();
  });
});

describe("score breakdown", () => {
  it("lists every scored element with its points, from the engine's breakdown", async () => {
    render(<ItemPlayer item={sata} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Temperature 37.2/ }));
    await userEvent.click(submit());

    const rows = within(breakdown()).getAllByRole("listitem");
    // Three correct options and one wrong selection are scored; untouched wrong options are not.
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Respiratory rate 28 breaths/min"),
      expect.stringContaining("Temperature 37.2 °C (99 °F)"),
      expect.stringContaining("Oxygen saturation 89% on room air"),
      expect.stringContaining("New confusion per family"),
    ]);
    expect(rows[0]!.textContent).toContain("+1");
    expect(rows[1]!.textContent).toContain("-1");
    // A missed correct answer scores nothing rather than losing a point.
    expect(rows[2]!.textContent).toContain("0");
  });

  it("says what each element was worth, and leaves right-or-wrong to the element itself", async () => {
    render(<ItemPlayer item={mc} />);
    await userEvent.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await userEvent.click(submit());
    const rows = within(breakdown()).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/Auscultate the lungs and assess oxygen saturation\s*\+1/);
    // The marks on the options carry correct and incorrect; repeating them here would only
    // duplicate them, and did collide with them.
    expect(within(breakdown()).queryByText("Correct")).toBeNull();
  });
});

describe("per-element rationale", () => {
  it("sits with the option it explains and describes it", async () => {
    render(<ItemPlayer item={mc} />);
    await userEvent.click(screen.getByRole("radio", { name: /Encourage the client/ }));
    await userEvent.click(submit());

    const chosen = screen.getByRole("radio", { name: /Encourage the client/ });
    expect(chosen).toHaveAccessibleDescription(/More fluid worsens an already overloaded/);
    // Every option is explained, including the one that was right.
    expect(screen.getByText(/Assessment comes first/)).toBeInTheDocument();
  });

  it("sits with the matrix row it explains", async () => {
    render(<ItemPlayer item={matrix} />);
    for (const row of [
      "Keep the client NPO initially",
      "Administer prescribed IV opioid analgesia",
      "Offer a high-fat diet to stimulate appetite",
      "Position the client side-lying with knees flexed, or sitting and leaning forward",
      "Teach about a low-sodium diet",
    ]) {
      await userEvent.click(
        within(screen.getByRole("table")).getByRole("radio", { name: `${row} Indicated` }),
      );
    }
    await userEvent.click(submit());

    const grid = screen.getByRole("table");
    const fat = within(grid).getByRole("rowheader", { name: /high-fat diet/ });
    expect(within(fat).getByText(/Fat is the strongest stimulus/)).toBeInTheDocument();
    // The row's controls must carry it too, or a reader never meets it.
    expect(
      within(grid).getByRole("radio", { name: /high-fat diet.*Contraindicated/ }),
    ).toHaveAccessibleDescription(/Fat is the strongest stimulus/);
  });

  it("reaches a matrix that takes several answers per row", async () => {
    render(<ItemPlayer item={matrixMr} />);
    const grid = () => screen.getByRole("table");
    for (const row of ["Unilateral weakness", "Slurred speech", "Blood glucose 48 mg/dL"]) {
      await userEvent.click(
        within(grid()).getByRole("checkbox", { name: `${row} Ischemic stroke` }),
      );
    }
    await userEvent.click(submit());
    expect(
      within(grid()).getByRole("checkbox", { name: /Blood glucose 48 mg\/dL Ischemic stroke/ }),
    ).toHaveAccessibleDescription(/belongs to hypoglycemia alone/);
  });

  it("explains each blank of a rationale sentence", async () => {
    render(<ItemPlayer item={rationale} />);
    const blanks = screen.getAllByRole("combobox");
    await userEvent.selectOptions(blanks[0]!, "cond_a");
    await userEvent.selectOptions(blanks[1]!, "ev1_b");
    await userEvent.selectOptions(blanks[2]!, "ev2_a");
    await userEvent.click(submit());

    expect(screen.getByText(/The anchor\./)).toBeInTheDocument();
    expect(screen.getByText(/a uterus not clamping down/)).toBeInTheDocument();
    expect(blanks[0]).toHaveAccessibleDescription(/The anchor\./);
  });

  it("leaves an item with no per-element rationale exactly as it was", async () => {
    render(<ItemPlayer item={noPerElement} />);
    await userEvent.click(screen.getByRole("radio", { name: /Diaphoresis and tremor/ }));
    await userEvent.click(submit());
    expect(
      screen.getByRole("radio", { name: /Diaphoresis and tremor/ }),
    ).toHaveAccessibleDescription("");
    // The breakdown is still there; only the explanations are absent.
    expect(breakdown()).toBeInTheDocument();
  });
});

describe("review mode", () => {
  it("replays a response read-only, with no key and nothing to submit", () => {
    render(
      <ItemPlayer
        item={mc}
        initialMode="review"
        initialResponse={{ type: "multiple_choice", optionId: "opt_c" }}
      />,
    );
    const chosen = screen.getByRole("radio", { name: /Document the weight/ });
    expect(chosen).toBeChecked();
    expect(chosen).toBeDisabled();
    // No marks, no score, no way to change it or to see what was right.
    expect(screen.queryByText("Correct")).toBeNull();
    expect(screen.queryByText("Missed")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Score" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });
});
