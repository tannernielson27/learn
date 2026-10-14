"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { folderOptions, NOT_IN_A_FOLDER, UNFILED, type FolderRow } from "@/lib/authoring/folders";
import { selectionLabel, type QuizOption } from "@/lib/authoring/quizMove";
import type { FolderFormState } from "./FolderNameForm";
import { StaysBehindList } from "./StaysBehindList";

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
}

const INITIAL: FolderFormState = { status: "idle" };
const idle: MoveAction = async (state) => state;

const selectClass =
  "tap-target max-w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

interface Asking {
  title: string;
  data: FormData;
}

function Outcome({ id, state, problem }: { id: string; state: FolderFormState; problem?: string }) {
  const error = problem ?? (state.status === "error" ? state.error : null);
  if (error) {
    return (
      <p id={id} role="alert" className="text-sm text-incorrect">
        {error}
      </p>
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
 * has some, or to another quiz. A move to another quiz asks first, saying what stays with this
 * quiz; nothing moves until the teacher confirms.
 */
export function QuizMoveForm({
  id,
  folders,
  moveToFolder,
  quizzes,
  moveToQuiz,
  staysBehind,
}: QuizMoveFormProps) {
  const [folderState, folderAction, folderPending] = useActionState(moveToFolder ?? idle, INITIAL);
  const [quizState, quizAction, quizPending] = useActionState(moveToQuiz ?? idle, INITIAL);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const byFolder = folders.length > 0 && moveToFolder !== undefined;
  const byQuiz = quizzes.length > 0 && moveToQuiz !== undefined;
  const folderError = folderState.status === "error";
  const quizError = problem !== undefined || quizState.status === "error";

  // Submitting by hand, as MoveToFolderForm does: the form, and the checkboxes that joined it, are
  // reset only once a move is done, never when one is refused.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (!quiz) return setProblem("Choose a quiz to move to.");
    if (counts.items + counts.caseStudies === 0) {
      return setProblem("Select at least one question or case study to move.");
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

  useEffect(() => {
    if (folderState.status === "done" || quizState.status === "done") formRef.current?.reset();
  }, [folderState, quizState]);

  if (!byFolder && !byQuiz) return null;

  return (
    <form ref={formRef} id={id} onSubmit={submit} className="flex flex-col gap-4">
      {byFolder ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-2">
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
            <Button type="submit" size="sm" disabled={folderPending}>
              Move
            </Button>
          </div>
          <Outcome id={`${uid}-folder-error`} state={folderState} />
        </div>
      ) : null}
      {byQuiz ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor={`${uid}-quiz`} className="text-sm font-medium text-ink-1">
                Move to another quiz
              </label>
              <select
                id={`${uid}-quiz`}
                name="quiz"
                defaultValue=""
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
            <Button size="sm" onClick={review} disabled={quizPending}>
              Move to quiz
            </Button>
          </div>
          <Outcome id={`${uid}-quiz-error`} state={quizState} problem={problem} />
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
            <StaysBehindList lines={staysBehind} />
          </Dialog>
        </div>
      ) : null}
    </form>
  );
}
