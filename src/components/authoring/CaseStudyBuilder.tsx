"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/Button";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { ItemEditorHostContext, type ItemEditorHost } from "./ItemEditorHost";

export type StepStatus = "empty" | "draft" | "attention" | "ready";

export interface BuilderStep {
  position: CjmmStep;
  status: StepStatus;
  /** What the step shows: its type chooser, or its item's editor. */
  panel: ReactNode;
}

export interface CaseStudyBuilderProps {
  /** Where leaving the case study goes; leaving with unsaved changes asks first. */
  back: { href: string; label: string };
  record: { status: StepStatus; panel: ReactNode };
  steps: readonly BuilderStep[];
  /** "N of 6 steps ready". */
  readyLabel: string;
  /** The case study's record, previewed with each step's item. */
  recordPreview?: ItemEditorHost["record"];
  /** The page's own heading, shown under the back link. */
  children?: ReactNode;
}

const STATUS_LABELS: Record<StepStatus, string> = {
  empty: "Not started",
  draft: "Draft",
  attention: "Needs attention",
  ready: "Ready",
};

type StepKey = "record" | CjmmStep;
type Pending = { step: StepKey } | { href: string };

const nameOf = (key: StepKey) =>
  key === "record" ? "Record" : `Step ${key}: ${CJMM_STEP_LABELS[key]}`;
const shortNameOf = (key: StepKey) => (key === "record" ? "The record" : `Step ${key}`);

/**
 * A case study built one step at a time, in any order: the record, then an item for each clinical
 * judgment step. The rail says where each step stands. Opening another step unmounts the open
 * step's editor, and leaving goes to another page, so either asks first when there is unsaved work.
 */
export function CaseStudyBuilder({
  back,
  record,
  steps,
  readyLabel,
  recordPreview,
  children,
}: CaseStudyBuilderProps) {
  const ids = useId();
  const router = useRouter();
  const [active, setActive] = useState<StepKey>("record");
  const [pending, setPending] = useState<Pending | null>(null);
  const dirty = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const onDirtyChange = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);
  // A started step swaps its type chooser for an editor, so focus stays with the step itself.
  const onStepStarted = useCallback(() => panel.current?.focus(), []);
  const host = useMemo<ItemEditorHost>(
    () => ({ inCaseStudy: true, record: recordPreview, onDirtyChange, onStepStarted }),
    [recordPreview, onDirtyChange, onStepStarted],
  );

  // After a move, focus goes to the opened step, so a keyboard user starts at its heading.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    panel.current?.focus();
  }, [active]);

  function open(key: StepKey) {
    if (key === active) return;
    if (dirty.current) {
      setPending({ step: key });
      return;
    }
    moved.current = true;
    setActive(key);
  }

  function leave(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (dirty.current) {
      setPending({ href: back.href });
      return;
    }
    router.push(back.href);
  }

  function discard() {
    if (pending === null) return;
    dirty.current = false;
    setPending(null);
    if ("href" in pending) {
      router.push(pending.href);
      return;
    }
    moved.current = true;
    setActive(pending.step);
  }

  const entries: { key: StepKey; status: StepStatus }[] = [
    { key: "record", status: record.status },
    ...steps.map((step) => ({ key: step.position, status: step.status })),
  ];
  const current =
    active === "record" ? record.panel : steps.find((step) => step.position === active)?.panel;
  const headingId = `${ids}-heading`;
  const askId = `${ids}-ask`;

  return (
    <>
      <p className="mb-2 text-sm">
        <a
          href={back.href}
          onClick={leave}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          {back.label}
        </a>
      </p>
      {children}

      {pending !== null ? (
        <div
          role="alertdialog"
          aria-labelledby={askId}
          className="mb-4 flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4"
        >
          <p id={askId} className="text-sm font-medium text-ink-1">
            {shortNameOf(active)} has unsaved changes
          </p>
          <p className="text-sm text-ink-2">
            {"href" in pending
              ? "Save them first, or discard them and leave this case study."
              : `Save them first, or discard them and open ${nameOf(pending.step)}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={discard}>
              Discard changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Stay on this step
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Case study steps" className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-sm text-ink-1">{readyLabel}</p>
          <ol className="flex flex-col gap-1">
            {entries.map(({ key, status }) => (
              <li key={String(key)}>
                <button
                  type="button"
                  aria-current={key === active ? "step" : undefined}
                  onClick={() => open(key)}
                  className="tap-target flex w-full flex-col items-start rounded-sm border border-line px-3 py-2 text-left transition-colors duration-fast hover:bg-surface-2 aria-[current=step]:border-accent aria-[current=step]:bg-surface-1"
                >
                  <span className="text-sm font-medium text-ink-1">{nameOf(key)}</span>
                  <span className="text-xs text-ink-2">{STATUS_LABELS[status]}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div
          ref={panel}
          role="region"
          tabIndex={-1}
          aria-labelledby={headingId}
          className="min-w-0 outline-none"
        >
          <h2 id={headingId} className="mb-4 font-read text-2xl text-ink-1">
            {nameOf(active)}
          </h2>
          <ItemEditorHostContext.Provider value={host}>
            {/* Keyed, so opening another step starts its editor fresh. */}
            <div key={String(active)}>{current}</div>
          </ItemEditorHostContext.Provider>
        </div>
      </div>
    </>
  );
}
