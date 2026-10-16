import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewEntryView } from "@/lib/authoring/aiImportReview";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { AiImportReview } from "./AiImportReview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./aiImportRequests", () => ({ postJson: vi.fn(), uploadToStorage: vi.fn() }));

const BANK = "00000000-0000-4000-8000-0000000000d1";
const BATCH = "00000000-0000-4000-8000-0000000000b1";

const entry = (over: Partial<ReviewEntryView>): ReviewEntryView => ({
  id: "e",
  version: 1,
  position: 0,
  kind: "item",
  type: "multiple_choice",
  status: "ready",
  reasons: [],
  sourceExcerpt: "Source words.",
  item: FIXTURES.multiple_choice.canonical,
  group: null,
  ...over,
});

const card = (heading: string) =>
  screen
    .getAllByRole("article")
    .find((article) => within(article).queryByRole("heading", { level: 3, name: heading }))!;

describe("AiImportReview's Edit link (#347)", () => {
  it("opens a single question's editor, and is not offered where it cannot be used", () => {
    render(
      <AiImportReview
        bankId={BANK}
        quizName="Cardiac"
        batchId={BATCH}
        fileNames={["Cardiac.md"]}
        entries={[
          entry({ id: "ready", position: 0 }),
          entry({ id: "answer", position: 1, status: "needs_answer", item: null }),
          entry({ id: "open", position: 2, type: null, status: "not_importable", item: null }),
          entry({ id: "gone", position: 3, status: "dropped" }),
          entry({
            id: "case",
            position: 4,
            kind: "case_study",
            type: null,
            item: null,
            group: { title: "Sepsis", step: null },
          }),
        ]}
        actions={{ drop: vi.fn(), restore: vi.fn() }}
      />,
    );
    const edit = within(card("Question 1")).getByRole("link", { name: "Edit Question 1" });
    expect(edit).toHaveAttribute("href", `/author/banks/${BANK}/ai-import/${BATCH}/ready`);
    expect(
      within(card("Question 2")).getByRole("link", { name: "Edit Question 2" }),
    ).toHaveAttribute("href", `/author/banks/${BANK}/ai-import/${BATCH}/answer`);
    for (const heading of ["Question 3", "Question 4", "Case study: Sepsis"]) {
      expect(within(card(heading)).queryByRole("link", { name: /^Edit/ })).not.toBeInTheDocument();
    }
  });
});
