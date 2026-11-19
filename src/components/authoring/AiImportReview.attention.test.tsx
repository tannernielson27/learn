import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewEntryView, ReviewFilter } from "@/lib/authoring/aiImportReview";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
import { AiImportReview, type AiImportReviewActions } from "./AiImportReview";

// #593: finishing a review. What a teacher does when several questions need attention, when a
// request fails, and when the entry is a case study.

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
const requests = vi.hoisted(() => ({ postJson: vi.fn(), uploadToStorage: vi.fn() }));
vi.mock("./aiImportRequests", () => requests);

const BANK = "00000000-0000-4000-8000-0000000000d1";
const BATCH = "00000000-0000-4000-8000-0000000000b1";
const BASE = `/author/banks/${BANK}/ai-import/${BATCH}`;

const entry = (over: Partial<ReviewEntryView>): ReviewEntryView => ({
  id: "e",
  version: 1,
  position: 0,
  kind: "item",
  type: "multiple_choice",
  status: "ready",
  reasons: [],
  sourceExcerpt: "Source words.",
  item: null,
  group: null,
  ...over,
});

// Nothing here has an item, so no player is drawn: these tests are about the screen around them.
const ENTRIES: ReviewEntryView[] = [
  entry({ id: "ready", position: 0 }),
  entry({ id: "answer", position: 1, version: 4, status: "needs_answer" }),
  entry({ id: "fix", position: 2, version: 2, status: "needs_fix" }),
  entry({ id: "open", position: 3, type: null, status: "not_importable" }),
  entry({ id: "gone", position: 4, status: "dropped" }),
];

function actions(over: Partial<AiImportReviewActions> = {}): AiImportReviewActions {
  return {
    drop: vi.fn(async (input) => ({
      ok: true as const,
      version: input.version + 1,
      status: "dropped" as const,
    })),
    restore: vi.fn(async (input) => ({
      ok: true as const,
      version: input.version + 1,
      status: "needs_fix" as const,
    })),
    ...over,
  };
}

function setup(
  options: {
    entries?: ReviewEntryView[];
    act?: AiImportReviewActions;
    filter?: ReviewFilter;
    notes?: string[];
  } = {},
) {
  const act = options.act ?? actions();
  render(
    <AiImportReview
      bankId={BANK}
      quizName="Cardiac"
      batchId={BATCH}
      fileNames={["Cardiac.pdf"]}
      entries={options.entries ?? ENTRIES}
      actions={act}
      initialFilter={options.filter}
      notes={options.notes}
    />,
  );
  return { act, user: userEvent.setup() };
}

const card = (heading: string) =>
  screen.getByRole("heading", { name: heading }).closest("article") as HTMLElement;

let replaceState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
  requests.postJson.mockReset();
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});
afterEach(() => replaceState.mockRestore());

describe("a request that fails (#593)", () => {
  it("leaves the card usable and says why when the Server Function rejects during Drop", async () => {
    const drop = vi
      .fn<AiImportReviewActions["drop"]>()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, version: 3, status: "dropped" });
    const { user } = setup({ act: actions({ drop }) });
    const fix = card("Question 3");
    await user.click(within(fix).getByRole("button", { name: "Drop" }));
    expect((await within(fix).findByRole("alert")).textContent).toBe(
      "That did not work. Try again.",
    );
    // Not left disabled: the same button works on the next press.
    const again = within(fix).getByRole("button", { name: "Drop" }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    await user.click(again);
    expect(await within(fix).findByRole("button", { name: "Restore" })).toBeTruthy();
    expect(drop).toHaveBeenCalledTimes(2);
  });

  it("says why when a change of type cannot reach the server, and keeps the form usable", async () => {
    requests.postJson.mockRejectedValue(new Error("Failed to fetch"));
    const { user } = setup();
    const fix = card("Question 3");
    await user.selectOptions(within(fix).getByRole("combobox", { name: "Change type" }), "bowtie");
    await user.click(within(fix).getByRole("button", { name: "Read again as this type" }));
    expect((await within(fix).findByRole("alert")).textContent).toBe(
      "That did not work. Try again.",
    );
    expect(
      (within(fix).getByRole("combobox", { name: "Change type" }) as HTMLSelectElement).disabled,
    ).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("versions another change moved on (#593)", () => {
  it("names the new version of a question whose duplicate flag changed with the drop", async () => {
    const drop = vi
      .fn<AiImportReviewActions["drop"]>()
      .mockResolvedValueOnce({
        ok: true,
        version: 3,
        status: "dropped",
        changed: [{ id: "answer", version: 9 }],
      })
      .mockResolvedValueOnce({ ok: true, version: 10, status: "dropped" });
    const { user } = setup({ act: actions({ drop }) });
    await user.click(within(card("Question 3")).getByRole("button", { name: "Drop" }));
    await within(card("Question 3")).findByRole("button", { name: "Restore" });
    // Still needing an answer, and now at the version the server gave, not the one first shown.
    expect(within(card("Question 2")).getByTestId("entry-status").textContent).toBe(
      "Needs an answer",
    );
    await user.click(within(card("Question 2")).getByRole("button", { name: "Drop" }));
    expect(drop).toHaveBeenLastCalledWith({ batchId: BATCH, entryId: "answer", version: 9 });
  });
});

describe("the filter and the place (#593)", () => {
  it("opens on the filter the address names, and writes each change back to the address", async () => {
    const { user } = setup({ filter: "needs_fix" });
    expect(screen.getByRole("button", { name: "Needs a fix (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Needs an answer (1)" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", `${BASE}?show=needs_answer`);
    await user.click(screen.getByRole("button", { name: "All (5)" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", BASE);
  });

  it("gives each card an address, and its Edit link the filter to come back to", () => {
    setup({ filter: "needs_answer" });
    const answer = card("Question 2");
    expect(answer).toHaveAttribute("id", "entry-answer");
    expect(within(answer).getByRole("link", { name: "Edit Question 2" })).toHaveAttribute(
      "href",
      `${BASE}/answer?show=needs_answer`,
    );
  });

  it("keeps the confirmation and the focus when a dropped card leaves the filter", async () => {
    const { user } = setup({ filter: "needs_fix" });
    await user.click(within(card("Question 3")).getByRole("button", { name: "Drop" }));
    const notice = await screen.findByTestId("review-notice");
    expect(notice.textContent).toBe("Dropped. Question 3 will not be imported.");
    expect(screen.queryByRole("heading", { name: "Question 3" })).toBeNull();
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.getByText("No questions match this filter.")).toBeTruthy();
  });

  it("says nothing above the list while the card that changed is still in it", async () => {
    const { user } = setup();
    await user.click(within(card("Question 3")).getByRole("button", { name: "Drop" }));
    expect(await within(card("Question 3")).findByRole("status")).toHaveTextContent("Dropped.");
    expect(screen.queryByTestId("review-notice")).toBeNull();
  });
});

describe("drop the ones that need attention (#593)", () => {
  it("asks once, then drops every question that needs an answer or a fix at its shown version", async () => {
    const dropAll = vi.fn(async () => ({
      ok: true as const,
      dropped: [
        { id: "answer", version: 5 },
        { id: "fix", version: 3 },
      ],
      left: 0,
    }));
    const { user } = setup({ act: actions({ dropAll }) });
    await user.click(screen.getByRole("button", { name: "Drop the 2 that need attention" }));
    expect(dropAll).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Drop the 2 that need attention?" });
    await user.click(within(dialog).getByRole("button", { name: "Drop 2" }));
    expect(dropAll).toHaveBeenCalledWith({
      batchId: BATCH,
      entries: [
        { entryId: "answer", version: 4 },
        { entryId: "fix", version: 2 },
      ],
    });
    expect((await screen.findByTestId("review-notice")).textContent).toBe("Dropped 2.");
    expect(screen.getByRole("button", { name: "Dropped (3)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /that needs? attention/ })).toBeNull();
    expect(screen.getByTestId("import-button").textContent).toBe("Import 1 question");
    expect(refresh).toHaveBeenCalled();
  });

  it("says how many another tab changed and were left", async () => {
    const dropAll = vi.fn(async () => ({
      ok: true as const,
      dropped: [{ id: "fix", version: 3 }],
      left: 1,
    }));
    const { user } = setup({ act: actions({ dropAll }) });
    await user.click(screen.getByTestId("drop-all-button"));
    await user.click(screen.getByTestId("drop-all-confirm"));
    expect((await screen.findByTestId("review-notice")).textContent).toBe(
      "Dropped 1. 1 changed in another tab and was left.",
    );
    expect(screen.getByRole("button", { name: "Drop the 1 that needs attention" })).toBeTruthy();
  });

  it("keeps the dialog open with the reason when it is refused, or fails outright", async () => {
    const dropAll = vi
      .fn<NonNullable<AiImportReviewActions["dropAll"]>>()
      .mockResolvedValueOnce({ ok: false, code: "not_review", message: "Not waiting for review." })
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    const { user } = setup({ act: actions({ dropAll }) });
    await user.click(screen.getByTestId("drop-all-button"));
    const dialog = screen.getByRole("dialog", { name: "Drop the 2 that need attention?" });
    await user.click(screen.getByTestId("drop-all-confirm"));
    expect(await within(dialog).findByText("Not waiting for review.")).toBeTruthy();
    await user.click(screen.getByTestId("drop-all-confirm"));
    expect(await within(dialog).findByText("That did not work. Try again.")).toBeTruthy();
    expect(screen.queryByTestId("review-notice")).toBeNull();
  });

  it("shows what was dropped before a failure, and reads the batch again", async () => {
    const dropAll = vi
      .fn<NonNullable<AiImportReviewActions["dropAll"]>>()
      .mockResolvedValueOnce({
        ok: false,
        code: "unavailable",
        message: "Dropped 1, then it stopped working. Try again for the rest.",
        dropped: [{ id: "answer", version: 5 }],
      })
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    const { user } = setup({ act: actions({ dropAll }) });
    await user.click(screen.getByTestId("drop-all-button"));
    await user.click(screen.getByTestId("drop-all-confirm"));
    const dialog = screen.getByRole("dialog", { name: /that needs? attention\?/ });
    expect(await within(dialog).findByText(/^Dropped 1, then it stopped working/)).toBeTruthy();
    // The card that was dropped says so at once, and the page asks the server for the rest.
    expect(within(card("Question 2")).getByTestId("entry-status").textContent).toBe("Dropped");
    expect(screen.getByRole("button", { name: "Dropped (2)" })).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
    // A request that never arrived may still have been carried out: read the batch again.
    await user.click(screen.getByTestId("drop-all-confirm"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it("is not offered when nothing needs attention, or when the page has no such action", () => {
    setup({ entries: [ENTRIES[0]!], act: actions({ dropAll: vi.fn() }) });
    expect(screen.queryByTestId("drop-all-button")).toBeNull();
  });
});

describe("the import confirmation (#593)", () => {
  it("states the counts, the quiz and what is left out before anything is imported", async () => {
    const importBatch = vi.fn(async () => ({ ok: true as const, questions: 1, caseStudies: 0 }));
    const kept = [ENTRIES[0]!, ENTRIES[3]!, ENTRIES[4]!];
    const { user } = setup({ entries: kept, act: actions({ importBatch }) });
    await user.click(screen.getByTestId("import-button"));
    const dialog = screen.getByRole("dialog", { name: "Import into Cardiac?" });
    expect(dialog).toHaveAccessibleDescription(
      "1 question will be added to Cardiac as a draft. Left out: 1 dropped and 1 not importable. The uploaded files are then deleted.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Keep reviewing" }));
    expect(importBatch).not.toHaveBeenCalled();
  });
});

describe("answers that reached no question (#592)", () => {
  it("says so beside what blocks the import", () => {
    setup({ notes: ["3 answers in the document could not be matched to a question."] });
    expect(screen.getByTestId("answer-notes").textContent).toContain("3 answers");
  });
});

describe("a case study that needs the teacher (#593)", () => {
  const whole = caseStudySchema.parse(sampleCaseStudy);
  const staged = {
    ...whole,
    items: whole.items.map((item, index) => {
      if (index !== 3) return item;
      return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
    }),
  };
  const unanswered = entry({
    id: "case",
    kind: "case_study",
    type: null,
    status: "needs_answer",
    item: staged,
    group: { title: "Pulmonary embolism", step: null },
    reasons: [
      { code: "needs_answer", message: "Step 4: The source marks no answer." },
      { code: "cut_off", message: "Step 2: The question runs past the end of what was read." },
    ],
  });
  const unbuilt = entry({
    id: "case",
    kind: "case_study",
    type: null,
    status: "needs_fix",
    item: null,
    group: { title: "Pulmonary embolism", step: null },
    reasons: [{ code: "needs_fix", message: "The patient record could not be read." }],
  });

  it("opens each step that has no key, or was flagged, in the question editor", () => {
    setup({ entries: [unanswered], act: actions({ split: vi.fn() }), filter: "needs_answer" });
    const links = within(card("Case study: Pulmonary embolism")).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Check step 2", `${BASE}/case?step=2&show=needs_answer`],
      ["Add the key to step 4", `${BASE}/case?step=4&show=needs_answer`],
    ]);
    // Each step is listed, and the one with no key says so, where it used to say nothing at all.
    const steps = [...card("Case study: Pulmonary embolism").querySelectorAll("summary")].map(
      (summary) => summary.textContent ?? "",
    );
    expect(steps).toHaveLength(6);
    expect(steps[3]).toMatch(/^Step 4 of 6: .* · No key yet$/);
    expect(steps.filter((text) => text.includes("No key yet"))).toHaveLength(1);
    expect(screen.queryByText("Can't preview yet.")).toBeNull();
  });

  it("splits into separate questions only after the dialog is confirmed", async () => {
    const split = vi.fn(async () => ({ ok: true as const, questions: 6 }));
    const { user } = setup({ entries: [unbuilt], act: actions({ split }) });
    const caseCard = card("Case study: Pulmonary embolism");
    expect(
      within(caseCard).getByText(/Split it into separate questions, or drop it\./),
    ).toBeTruthy();
    expect(within(caseCard).queryByRole("link")).toBeNull();
    await user.click(
      within(caseCard).getByRole("button", { name: "Split into separate questions" }),
    );
    expect(split).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Split this case study?" });
    expect(dialog).toHaveAccessibleDescription(/The patient record is not attached to them/);
    await user.click(within(dialog).getByRole("button", { name: "Split" }));
    expect(split).toHaveBeenCalledWith({ batchId: BATCH, entryId: "case", version: 1 });
    expect((await screen.findByTestId("review-notice")).textContent).toBe(
      "Case study: Pulmonary embolism is now 6 separate questions.",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the dialog open and says why when the split is refused", async () => {
    const split = vi
      .fn<NonNullable<AiImportReviewActions["split"]>>()
      .mockResolvedValueOnce({
        ok: false,
        code: "split_too_many",
        message:
          "An import holds at most 150 questions, and splitting this case study would pass that.",
      })
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    const { user } = setup({ entries: [unbuilt], act: actions({ split }) });
    await user.click(screen.getByRole("button", { name: "Split into separate questions" }));
    const dialog = screen.getByRole("dialog", { name: "Split this case study?" });
    await user.click(within(dialog).getByRole("button", { name: "Split" }));
    expect(await within(dialog).findByText(/at most 150 questions/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Split" }));
    expect(await within(dialog).findByText("That did not work. Try again.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers neither path for a dropped case study", () => {
    setup({ entries: [{ ...unanswered, status: "dropped" }], act: actions({ split: vi.fn() }) });
    expect(screen.queryByRole("button", { name: "Split into separate questions" })).toBeNull();
    expect(screen.queryByRole("link", { name: /step 4/ })).toBeNull();
  });
});

describe("the source beside a question (#593)", () => {
  it("draws the document's marks as formatting, and never as markup", async () => {
    const source =
      "Which food?\nA. Tea\n**B. Yogurt**\n==C. Milk=={yellow}\n<script>alert(1)</script> <img src=x>";
    const { user } = setup({ entries: [entry({ id: "q", sourceExcerpt: source })] });
    await user.click(screen.getByRole("button", { name: "Show source" }));
    const region = screen.getByRole("region", { name: "Question 1, source" });
    expect(region.querySelector("strong")?.textContent).toBe("B. Yogurt");
    expect(region.querySelector("mark")?.textContent).toBe("C. Milk");
    // The asterisks and the colour name are gone; what looks like HTML is shown as its text.
    expect(region.textContent).not.toContain("**");
    expect(region.textContent).not.toContain("{yellow}");
    expect(region.textContent).toContain("<script>alert(1)</script> <img src=x>");
    expect(region.querySelector("script, img")).toBeNull();
    expect(within(region).getByText("A highlight is the document's own.")).toBeTruthy();
  });

  it("says when the list holds only the start of a long source, and links to all of it", async () => {
    const { user } = setup({
      entries: [
        entry({ id: "q", sourceExcerpt: "The first lines.", sourceCut: true }),
        entry({ id: "open", position: 1, type: null, status: "not_importable", sourceCut: true }),
        entry({ id: "whole", position: 2 }),
      ],
      filter: "ready",
    });
    await user.click(within(card("Question 1")).getByRole("button", { name: "Show source" }));
    const region = screen.getByRole("region", { name: "Question 1, source" });
    expect(within(region).getByTestId("source-cut").textContent).toContain("Cut short here.");
    expect(
      within(region).getByRole("link", { name: "See all of it on the edit page" }),
    ).toHaveAttribute("href", `${BASE}/q?show=ready`);
    // A whole source says nothing; one with no edit page is cut without a link.
    await user.click(screen.getByRole("button", { name: "All (3)" }));
    for (const heading of ["Question 2", "Question 3"]) {
      await user.click(within(card(heading)).getByRole("button", { name: "Show source" }));
    }
    const open = screen.getByRole("region", { name: "Question 2, source" });
    expect(within(open).getByTestId("source-cut")).toBeTruthy();
    expect(within(open).queryByRole("link")).toBeNull();
    const whole = screen.getByRole("region", { name: "Question 3, source" });
    expect(within(whole).queryByTestId("source-cut")).toBeNull();
  });

  it("says a PDF's source is the opening words, and where to look for the rest", async () => {
    const { user } = setup({
      entries: [
        entry({ id: "q", sourceExcerpt: "A client reports", sourcePages: { from: 3, to: 10 } }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Show source" }));
    expect(screen.getByTestId("source-pages").textContent).toBe(
      // The pages are the part of the file it was read from, not the question's own span.
      "Opening words only. This question was read from pages 3 to 10 of Cardiac.pdf.",
    );
  });
});
