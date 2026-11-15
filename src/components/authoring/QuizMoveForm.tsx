"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { folderOptions, NOT_IN_A_FOLDER, UNFILED, type FolderRow } from "@/lib/authoring/folders";
import { ARCHIVE_ONE } from "@/lib/authoring/archiveSelection";
import { selectionLabel, type QuizOption } from "@/lib/authoring/quizMove";
import { useArchiveSelected, type ArchiveSelectedAction } from "./ArchiveSelected";
import type { FolderFormState } from "./FolderNameForm";
import { StaysBehindList } from "./StaysBehindList";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { FieldError } from "./FieldError";

type MoveAction = (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;

export interface QuizMoveFormProps {
  /** The lists' checkboxes join this form by its id. */
  id: string;
  /** This quiz's own folders; none offers no move between folders. */
  folders: readonly FolderRow[];
  moveToFolder?: MoveAction;
  /** The other quizzes in the workspace; none offers no move to another quiz. */
  quizzes: readonly QuizOption[];
  moveToQuiz?: MoveAction;
  /** What stays with this quiz when questions leave it, said before they do. */
  staysBehind: readonly string[];
  /** Archives the selection, or one row's own Archive (#471); without it, nothing archives. */
  archive?: ArchiveSelectedAction;
  /** The Archived view, linked from what an archive says. */
  archivedHref?: string;
  /**
   * Whether the lists hold any rows to select. False after the last ones were archived: the form
   * stays, so what the archive said and its link to Archived outlive the refresh that emptied
   * the lists, but there is nothing left to Archive selected.
   */
  hasRows?: boolean;
}

const INITIAL: FolderFormState = { status: "idle" };
const idle: MoveAction = async (state) => state;

const selectClass = fieldClasses("max-w-full px-3 text-base");

interface Asking {
  title: string;
  data: FormData;
}

/** The names a row's checkbox posts under: a question or a case study. */
const SELECTABLE = new Set(["item", "caseStudy"]);

/**
 * How many rows are checked for this form. The checkboxes sit in the lists, outside the form, and
 * join it by id, so this counts the form's own elements: on every change, after a reset, and after
 * every render, since a refresh can take checked rows out of the list without an event.
 */
function useSelectedCount(formRef: RefObject<HTMLFormElement | null>): number {
  const [count, setCount] = useState(0);
  const recount = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    let checked = 0;
    for (const element of Array.from(form.elements)) {
      if (
        element instanceof HTMLInputElement &&
        element.type === "checkbox" &&
        element.checked &&
        SELECTABLE.has(element.name)
      ) {
        checked += 1;
      }
    }
    setCount(checked);
  }, [formRef]);

  useEffect(() => {
    const form = formRef.current;
    const changed = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.form === formRef.current) recount();
    };
    // A reset's event comes before the reset itself, so count once it is done.
    const reset = () => queueMicrotask(recount);
    document.addEventListener("change", changed);
    form?.addEventListener("reset", reset);
    return () => {
      document.removeEventListener("change", changed);
      form?.removeEventListener("reset", reset);
    };
  }, [formRef, recount]);
  useEffect(recount);
  return count;
}

function Outcome({ id, state, problem }: { id: string; state: FolderFormState; problem?: string }) {
  const error = problem ?? (state.status === "error" ? state.error : null);
  if (error) {
    return (
      <FieldError id={id} role="alert">
        {error}
      </FieldError>
    );
  }
  return state.status === "done" ? (
    <p role="status" className="text-sm text-ink-2">
      {state.message}
    </p>
  ) : null;
}

/**
 * The quiz page's selection (#417): what is checked moves to one of this quiz's folders, where it
 * has some, or to another quiz, or is archived (#471). A move to another quiz asks first, saying
 * what stays with this quiz, and so does an archive; nothing changes until the teacher confirms.
 *
 * A selection bar (#563): the moves and Archive selected appear only once a row is checked, in a
 * bar that stays at the foot of the window while the lists scroll, so checking a row never moves
 * the rows. What a move or an archive said stays in the bar until it is dismissed.
 */
export function QuizMoveForm({
  id,
  folders,
  moveToFolder,
  quizzes,
  moveToQuiz,
  staysBehind,
  archive,
  archivedHref,
  hasRows = true,
}: QuizMoveFormProps) {
  const [folderState, folderAction, folderPending] = useActionState(moveToFolder ?? idle, INITIAL);
  const [quizState, quizAction, quizPending] = useActionState(moveToQuiz ?? idle, INITIAL);
  const [asking, setAsking] = useState<Asking | null>(null);
  // A refusal before asking: which field it is about, so only that one is marked invalid.
  const [problem, setProblem] = useState<{ quiz: boolean; message: string } | undefined>(undefined);
  // Outcomes the teacher has read and dismissed.
  const [hidden, setHidden] = useState<readonly object[]>([]);
  const hide = useCallback((state: object) => setHidden((now) => [...now, state]), []);
  const formRef = useRef<HTMLFormElement>(null);
  const archiving = useArchiveSelected(archive, formRef, archivedHref, hasRows, hidden, hide);
  const selected = useSelectedCount(formRef);
  const uid = useId();
  const byFolder = folders.length > 0 && moveToFolder !== undefined;
  const byQuiz = quizzes.length > 0 && moveToQuiz !== undefined;
  const folderError = folderState.status === "error";
  const quizError = problem?.quiz === true || (!problem && quizState.status === "error");
  const folderSaid = folderState.status !== "idle" && !hidden.includes(folderState);
  const quizSaid =
    problem !== undefined || (quizState.status !== "idle" && !hidden.includes(quizState));

  // Submitting by hand, as MoveToFolderForm does: the form, and the checkboxes that joined it, are
  // reset only once a move is done, never when one is refused.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A row's own Archive sends this form too, carrying only its row: that asks, and moves nothing.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name === ARCHIVE_ONE) {
      archiving.askOne(submitter);
      return;
    }
    if (!byFolder) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => folderAction(formData));
  }

  function review() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const quiz = quizzes.find((option) => option.id === data.get("quiz"));
    const counts = {
      items: data.getAll("item").length,
      caseStudies: data.getAll("caseStudy").length,
    };
    if (!quiz) return setProblem({ quiz: true, message: "Choose a quiz to move to." });
    if (counts.items + counts.caseStudies === 0) {
      return setProblem({
        quiz: false,
        message: "Select at least one question or case study to move.",
      });
    }
    setProblem(undefined);
    setAsking({ title: `Move ${selectionLabel(counts)} to ${quiz.name}?`, data });
  }

  function confirm() {
    if (!asking) return;
    const { data } = asking;
    setAsking(null);
    startTransition(() => quizAction(data));
  }

  // Each on its own state, so a later refusal of the other move never clears a new selection.
  useEffect(() => {
    if (folderState.status === "done") formRef.current?.reset();
  }, [folderState]);
  useEffect(() => {
    if (quizState.status === "done") formRef.current?.reset();
  }, [quizState]);

  if (!byFolder && !byQuiz && !archive) return null;

  const outcomes = [
    byFolder && folderSaid ? (
      <Outcome key="folder" id={`${uid}-folder-error`} state={folderState} />
    ) : null,
    byQuiz && quizSaid ? (
      <Outcome key="quiz" id={`${uid}-quiz-error`} state={quizState} problem={problem?.message} />
    ) : null,
    archiving.outcome ? <div key="archive">{archiving.outcome}</div> : null,
  ].filter(Boolean);
  const open = selected > 0;
  const shown = open || outcomes.length > 0;

  function dismiss() {
    setProblem(undefined);
    if (folderState.status !== "idle") hide(folderState);
    if (quizState.status !== "idle") hide(quizState);
    archiving.dismiss();
  }

  return (
    <form
      ref={formRef}
      id={id}
      onSubmit={submit}
      data-selection-bar={shown ? "open" : "closed"}
      className={
        shown
          ? "sticky bottom-0 z-10 flex flex-col gap-3 rounded-t-md border border-b-0 border-line bg-surface-1 px-4 pt-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]"
          : // No box until there is something to show, so it adds no gap to the column.
            "contents"
      }
    >
      {open ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <p className="py-2.5 text-sm font-semibold text-ink-1">{selected} selected</p>
          {byFolder ? (
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${uid}-folder`} className="text-sm font-medium text-ink-1">
                  Move selected to
                </label>
                <select
                  id={`${uid}-folder`}
                  name="folder"
                  defaultValue=""
                  aria-invalid={folderError || undefined}
                  aria-describedby={folderError ? `${uid}-folder-error` : undefined}
                  className={selectClass}
                >
                  <option value="" disabled>
                    Choose a folder
                  </option>
                  <option value={UNFILED}>{NOT_IN_A_FOLDER}</option>
                  {folderOptions(folders).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.path}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm" busy={folderPending}>
                Move
              </Button>
            </div>
          ) : null}
          {byQuiz ? (
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${uid}-quiz`} className="text-sm font-medium text-ink-1">
                  Move to another quiz
                </label>
                <select
                  id={`${uid}-quiz`}
                  name="quiz"
                  defaultValue=""
                  onChange={() => setProblem(undefined)}
                  aria-invalid={quizError || undefined}
                  aria-describedby={quizError ? `${uid}-quiz-error` : undefined}
                  className={selectClass}
                >
                  <option value="" disabled>
                    Choose a quiz
                  </option>
                  {quizzes.map((quiz) => (
                    <option key={quiz.id} value={quiz.id}>
                      {quiz.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={review} busy={quizPending}>
                Move to quiz
              </Button>
            </div>
          ) : null}
          {archiving.button}
        </div>
      ) : null}
      {outcomes.length > 0 ? (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 flex-col gap-1">{outcomes}</div>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {byQuiz ? (
        <Dialog
          open={asking !== null}
          onClose={() => setAsking(null)}
          title={asking?.title ?? "Move to another quiz?"}
          description="They keep their history and tags."
          actions={
            <>
              <Button variant="ghost" onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirm}>
                Move
              </Button>
            </>
          }
        >
          {staysBehind.length > 0 ? <StaysBehindList lines={staysBehind} /> : null}
        </Dialog>
      ) : null}
      {archiving.dialog}
    </form>
  );
}
