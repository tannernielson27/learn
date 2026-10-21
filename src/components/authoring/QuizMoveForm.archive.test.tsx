import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ArchiveSelectionState } from "@/lib/authoring/archiveSelection";
import { ArchiveRowButton } from "./ArchiveRowButton";
import { QuizMoveForm } from "./QuizMoveForm";

const FORM = "selection-form";
const ITEM = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const OTHER = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a03";
const CASE = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a02";
const ARCHIVED_HREF = "/author/banks/b?status=archived";

type Archive = (state: ArchiveSelectionState, formData: FormData) => Promise<ArchiveSelectionState>;

/** The quiz page's shape: the form above, the rows' checkboxes and Archive buttons outside it. */
function draw(archive: Archive) {
  return render(
    <>
      <QuizMoveForm
        id={FORM}
        folders={[]}
        quizzes={[]}
        staysBehind={[]}
        archive={archive}
        archivedHref={ARCHIVED_HREF}
      />
      <ul>
        <li>
          <input type="checkbox" form={FORM} name="item" value={ITEM} aria-label="Select Pain" />
          <ArchiveRowButton formId={FORM} kind="item" id={ITEM} name="Pain" />
        </li>
        <li>
          <input type="checkbox" form={FORM} name="item" value={OTHER} aria-label="Select Fever" />
        </li>
        <li>
          <input
            type="checkbox"
            form={FORM}
            name="caseStudy"
            value={CASE}
            aria-label="Select Mr. Lee"
          />
          <ArchiveRowButton formId={FORM} kind="caseStudy" id={CASE} name="Mr. Lee" />
        </li>
      </ul>
    </>,
  );
}

const done = (message: string, refusals: string[] = []): ArchiveSelectionState => ({
  status: "done",
  message,
  refusals,
});

describe("QuizMoveForm: archive", () => {
  it("offers Archive selected even with nowhere to move to", () => {
    draw(vi.fn<Archive>());
    expect(screen.getByRole("button", { name: "Archive selected" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("asks first, naming how many, and archives the checked rows once confirmed", async () => {
    const archive = vi.fn<Archive>(async () => done("Archived 1 question and 1 case study."));
    draw(archive);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pain" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Mr. Lee" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive selected" }));

    const dialog = screen.getByRole("dialog", { name: "Archive 1 question and 1 case study?" });
    expect(archive).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    const data = archive.mock.calls[0]![1];
    expect(data.getAll("item")).toEqual([ITEM]);
    expect(data.getAll("caseStudy")).toEqual([CASE]);
    const outcome = await screen.findByRole("status");
    expect(outcome).toHaveTextContent("Archived 1 question and 1 case study.");
    expect(outcome).toHaveFocus();
    expect(within(outcome).getByRole("link", { name: "Show archived" })).toHaveAttribute(
      "href",
      ARCHIVED_HREF,
    );
    // The selection is cleared once it is archived.
    expect(screen.getByRole("checkbox", { name: "Select Pain" })).not.toBeChecked();
  });

  it("archives nothing when the confirm is cancelled", async () => {
    const archive = vi.fn<Archive>();
    draw(archive);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Pain" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive selected" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(archive).not.toHaveBeenCalled();
  });

  it("asks for a selection before opening the confirm", async () => {
    draw(vi.fn<Archive>());
    await userEvent.click(screen.getByRole("button", { name: "Archive selected" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one question or case study to archive.",
    );
  });

  it("archives one row from its own button, leaving the other checks alone", async () => {
    const archive = vi.fn<Archive>(async () => done("Archived 1 question."));
    draw(archive);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fever" }));
    await userEvent.click(screen.getByRole("button", { name: "Archive Pain" }));

    const dialog = screen.getByRole("dialog", { name: "Archive 1 question?" });
    expect(dialog).toHaveTextContent("Pain");
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    const data = archive.mock.calls[0]![1];
    expect(data.get("archiveOne")).toBe(`item:${ITEM}`);
    expect(data.getAll("item")).toEqual([]);
    await screen.findByRole("status");
    expect(screen.getByRole("checkbox", { name: "Select Fever" })).toBeChecked();
  });

  it("names a case study from its row", async () => {
    draw(vi.fn<Archive>());
    await userEvent.click(screen.getByRole("button", { name: "Archive Mr. Lee" }));
    expect(screen.getByRole("dialog", { name: "Archive 1 case study?" })).toHaveTextContent(
      "Mr. Lee",
    );
  });

  it("says what stayed and why, beside what was archived", async () => {
    const step = 'A question is step 2 of the case study "Mr. Lee", so it stays.';
    draw(vi.fn<Archive>(async () => done("Archived 1 question.", [step])));
    await userEvent.click(screen.getByRole("button", { name: "Archive Pain" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }),
    );
    const outcome = await screen.findByRole("status");
    expect(outcome).toHaveTextContent(step);
  });

  it("says why nothing was archived, as an alert", async () => {
    draw(
      vi.fn<Archive>(async () => ({
        status: "error",
        error: "Nothing was archived.",
        refusals: ["It is a step."],
      })),
    );
    await userEvent.click(screen.getByRole("button", { name: "Archive Pain" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nothing was archived.");
    expect(alert).toHaveTextContent("It is a step.");
    expect(alert).toHaveFocus();
  });
});
