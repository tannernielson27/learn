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
import { CaseStudyPlayer } from "@/components/case-study/CaseStudyPlayer";
import { Button } from "@/components/ui/Button";
import type { CaseStudy } from "@/lib/ngn/schemas";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { ItemEditorHostContext, type ItemEditorHost } from "./ItemEditorHost";

export type StepStatus = "empty" | "draft" | "attention" | "ready";

export interface BuilderStep {
  position: CjmmStep;
  status: StepStatus;
  /** What the step shows: its type chooser, or its item's editor. */
  panel: ReactNode;
}

/** The saved case study as a student would play it, or what it still needs first. */
export type CaseStudyPreview =
  { ok: true; caseStudy: CaseStudy } | { ok: false; blockers: string[] };

export type PublishResult = { ok: true } | { ok: false; error: string; blockers?: string[] };

export interface CaseStudyBuilderProps {
  /** Where leaving the case study goes; leaving with unsaved changes asks first. */
  back: { href: string; label: string };
  record: { status: StepStatus; panel: ReactNode };
  steps: readonly BuilderStep[];
  /** "N of 6 steps ready". */
  readyLabel: string;
  /** The case study's record, previewed with each step's item. */
  recordPreview?: ItemEditorHost["record"];
  /** Enables Preview case study. */
  preview?: CaseStudyPreview;
  /** Enables Publish case study. */
  publish?: () => Promise<PublishResult>;
  /** The page's own heading, shown under the back link. */
  children?: ReactNode;
}

const STATUS_LABELS: Record<StepStatus, string> = {
  empty: "Not started",
  draft: "Draft",
  attention: "Needs attention",
  ready: "Ready",
};

const PUBLISH_FAILED = "The case study could not be published. Try again.";

type StepKey = "record" | CjmmStep;
type Pending = { step: StepKey } | { href: string } | { action: "preview" | "publish" };
type Notice =
  | { kind: "previewBlocked"; blockers: string[] }
  | { kind: "published" }
  | { kind: "publishFailed"; error: string; blockers: string[] };

const nameOf = (key: StepKey) =>
  key === "record" ? "Record" : `Step ${key}: ${CJMM_STEP_LABELS[key]}`;
const shortNameOf = (key: StepKey) => (key === "record" ? "The record" : `Step ${key}`);

function afterDiscard(pending: Pending): string {
  if ("href" in pending) return "discard them and leave this case study";
  if ("action" in pending) {
    return pending.action === "preview"
      ? "discard them and preview the case study"
      : "discard them and publish the case study";
  }
  return `discard them and open ${nameOf(pending.step)}`;
}

function BlockerList({ blockers }: { blockers: readonly string[] }) {
  return blockers.length > 0 ? (
    <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
      {blockers.map((blocker) => (
        <li key={blocker}>{blocker}</li>
      ))}
    </ul>
  ) : null;
}

/**
 * A case study built one step at a time, in any order: the record, then an item for each clinical
 * judgment step. The rail says where each step stands. Opening another step, leaving, previewing
 * and publishing all move away from the open editor, so each asks first when there is unsaved work.
 */
export function CaseStudyBuilder({
  back,
  record,
  steps,
  readyLabel,
  recordPreview,
  preview,
  publish,
  children,
}: CaseStudyBuilderProps) {
  const ids = useId();
  const router = useRouter();
  const [active, setActive] = useState<StepKey>("record");
  const [pending, setPending] = useState<Pending | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [publishing, setPublishing] = useState(false);
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
  }, [active, previewing]);

  // Opening the preview replaces the step that held focus, so focus moves into the preview.
  const previewRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (previewing) previewRegion.current?.focus();
  }, [previewing]);

  function open(key: StepKey) {
    if (key === active) return;
    if (dirty.current) {
      setPending({ step: key });
      return;
    }
    // A publish notice describes the case study as it was; it goes stale once work moves on.
    setNotice(null);
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

  function startPreview() {
    if (!preview) return;
    if (!preview.ok) {
      setNotice({ kind: "previewBlocked", blockers: preview.blockers });
      return;
    }
    setNotice(null);
    setPreviewing(true);
  }

  async function runPublish() {
    if (!publish || publishing) return;
    setPublishing(true);
    setNotice(null);
    try {
      const result = await publish();
      if (result.ok) {
        setNotice({ kind: "published" });
        router.refresh();
      } else {
        setNotice({ kind: "publishFailed", error: result.error, blockers: result.blockers ?? [] });
      }
    } catch {
      // A request that fails outright rejects instead of returning a result.
      setNotice({ kind: "publishFailed", error: PUBLISH_FAILED, blockers: [] });
    } finally {
      setPublishing(false);
    }
  }

  function request(action: "preview" | "publish") {
    if (dirty.current) {
      setPending({ action });
      return;
    }
    if (action === "preview") startPreview();
    else void runPublish();
  }

  function discard() {
    if (pending === null) return;
    dirty.current = false;
    setPending(null);
    if ("href" in pending) {
      router.push(pending.href);
    } else if ("action" in pending) {
      if (pending.action === "preview") startPreview();
      else void runPublish();
    } else {
      setNotice(null);
      moved.current = true;
      setActive(pending.step);
    }
  }

  const entries: { key: StepKey; status: StepStatus }[] = [
    { key: "record", status: record.status },
    ...steps.map((step) => ({ key: step.position, status: step.status })),
  ];
  const current =
    active === "record" ? record.panel : steps.find((step) => step.position === active)?.panel;
  const headingId = `${ids}-heading`;
  const askId = `${ids}-ask`;
  const backLink = (
    <p className="mb-2 text-sm">
      <a
        href={back.href}
        onClick={leave}
        className="text-accent-ink underline-offset-4 hover:underline"
      >
        {back.label}
      </a>
    </p>
  );

  if (previewing && preview?.ok) {
    return (
      <>
        {backLink}
        {children}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              moved.current = true;
              setPreviewing(false);
            }}
          >
            Back to editing
          </Button>
          <p className="text-sm text-ink-2">
            Previewing the saved case study, scored in this browser.
          </p>
        </div>
        <div
          ref={previewRegion}
          role="region"
          aria-label="Case study preview"
          tabIndex={-1}
          className="overflow-hidden rounded-md border border-line outline-none"
        >
          <CaseStudyPlayer caseStudy={preview.caseStudy} />
        </div>
      </>
    );
  }

  return (
    <>
      {backLink}
      {children}

      {preview || publish ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {preview ? <Button onClick={() => request("preview")}>Preview case study</Button> : null}
          {publish ? (
            <Button variant="primary" disabled={publishing} onClick={() => request("publish")}>
              Publish case study
            </Button>
          ) : null}
        </div>
      ) : null}

      {notice?.kind === "previewBlocked" ? (
        <div role="alert" className="mb-4 rounded-sm border border-line bg-surface-1 p-4 text-sm">
          <p className="font-medium text-ink-1">This case study cannot be previewed yet.</p>
          <BlockerList blockers={notice.blockers} />
        </div>
      ) : null}
      {notice?.kind === "published" ? (
        <p role="status" className="mb-4 text-sm text-ink-2">
          Case study published.
        </p>
      ) : null}
      {notice?.kind === "publishFailed" ? (
        <div role="alert" className="mb-4 rounded-sm border border-line bg-surface-1 p-4 text-sm">
          <p className="font-medium text-incorrect">{notice.error}</p>
          <BlockerList blockers={notice.blockers} />
        </div>
      ) : null}

      {pending !== null ? (
        <div
          role="alertdialog"
          aria-labelledby={askId}
          className="mb-4 flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4"
        >
          <p id={askId} className="text-sm font-medium text-ink-1">
            {shortNameOf(active)} has unsaved changes
          </p>
          <p className="text-sm text-ink-2">Save them first, or {afterDiscard(pending)}.</p>
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
