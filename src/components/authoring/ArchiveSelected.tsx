"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import {
  ARCHIVE_ONE,
  archiveConfirmTitle,
  parseArchiveOne,
  type ArchiveSelectionState,
} from "@/lib/authoring/archiveSelection";

export type ArchiveSelectedAction = (
  state: ArchiveSelectionState,
  formData: FormData,
) => Promise<ArchiveSelectionState>;

interface Asking {
  title: string;
  /** The row's name, for one row's own Archive. */
  name?: string;
  data: FormData;
  /** Archiving the checked rows clears the checks once done; one row's Archive leaves them. */
  clears: boolean;
}

const IDLE: ArchiveSelectionState = { status: "idle" };
const idle: ArchiveSelectedAction = async (state) => state;
const NOTHING_SELECTED = "Select at least one question or case study to archive.";

function Refusals({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * Archive for the quiz page's selection form (#471): the Archive selected button, the confirm
 * that names how many, and what happened. Nothing is archived until the teacher confirms. The
 * outcome takes focus when it arrives, since the rows it is about leave the list.
 */
export function useArchiveSelected(
  action: ArchiveSelectedAction | undefined,
  formRef: RefObject<HTMLFormElement | null>,
  archivedHref: string | undefined,
) {
  const [state, run, pending] = useActionState(action ?? idle, IDLE);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const clears = useRef(false);
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "idle") return;
    if (state.status === "done" && clears.current) formRef.current?.reset();
    outcomeRef.current?.focus();
  }, [state, formRef]);

  /** A row's own Archive sent the form: ask about that row alone. */
  function askOne(submitter: HTMLButtonElement) {
    const one = parseArchiveOne(submitter.value);
    if (!one) return;
    const data = new FormData();
    data.set(ARCHIVE_ONE, submitter.value);
    const counts =
      one.kind === "item" ? { items: 1, caseStudies: 0 } : { items: 0, caseStudies: 1 };
    setProblem(undefined);
    setAsking({
      title: archiveConfirmTitle(counts),
      name: submitter.dataset.archiveName,
      data,
      clears: false,
    });
  }

  function askSelected() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const counts = {
      items: data.getAll("item").length,
      caseStudies: data.getAll("caseStudy").length,
    };
    if (counts.items + counts.caseStudies === 0) return setProblem(NOTHING_SELECTED);
    setProblem(undefined);
    setAsking({ title: archiveConfirmTitle(counts), data, clears: true });
  }

  function confirm() {
    if (!asking) return;
    const { data } = asking;
    clears.current = asking.clears;
    setAsking(null);
    startTransition(() => run(data));
  }

  const controls = action ? (
    <div className="flex flex-col gap-2">
      <div>
        <Button size="sm" onClick={askSelected} disabled={pending}>
          Archive selected
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-incorrect">
          {problem}
        </p>
      ) : state.status === "done" ? (
        <div ref={outcomeRef} role="status" tabIndex={-1} className="text-sm text-ink-1">
          <p>
            {state.message} Nothing is erased: Archived lists them, and Restore brings each one
            back.{" "}
            {archivedHref ? (
              <Link href={archivedHref} className="font-medium text-accent-ink underline">
                Show archived
              </Link>
            ) : null}
          </p>
          <Refusals lines={state.refusals} />
        </div>
      ) : state.status === "error" ? (
        <div ref={outcomeRef} role="alert" tabIndex={-1} className="text-sm text-incorrect">
          <p>{state.error}</p>
          <Refusals lines={state.refusals} />
        </div>
      ) : null}
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking?.title ?? "Archive?"}
        description={
          asking?.clears === false
            ? "It leaves this quiz's lists. Nothing is erased: Archived lists it, and Restore brings it back."
            : "They leave this quiz's lists. Nothing is erased: Archived lists them, and Restore brings each one back."
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirm}>
              Archive
            </Button>
          </>
        }
      >
        {asking?.name ? <p className="break-words text-ink-1">{asking.name}</p> : null}
      </Dialog>
    </div>
  ) : null;

  return { askOne, controls };
}
