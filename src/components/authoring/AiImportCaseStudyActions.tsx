"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { stepsNeedingAttention } from "@/lib/authoring/aiImportCaseStudy";
import type { ReviewEntryView } from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { UNEXPECTED } from "./AiImportDiscard";
import { FieldError } from "./FieldError";

export interface AiImportCaseStudyActionsProps {
  entry: ReviewEntryView;
  /** "Case study: Ectopic pregnancy". */
  heading: string;
  /** A step's edit page. */
  stepHref: (step: number) => string;
  /** Replaces the case study with six separate questions; resolves once the page has them. */
  onSplit: (entry: ReviewEntryView) => Promise<{ ok: true } | AiImportFailure>;
  disabled?: boolean;
}

/**
 * The two ways to finish a staged case study (#593, owner decision 2026-11-17). A step with no
 * key opens in its type's own editor, and the case study is ready once every step is keyed. Or
 * the case study is split into six separate questions, without the patient record, which is the
 * way out when the record itself could not be built. Splitting asks first: it cannot be undone.
 */
export function AiImportCaseStudyActions({
  entry,
  heading,
  stepHref,
  onSplit,
  disabled = false,
}: AiImportCaseStudyActionsProps) {
  const messageId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const steps = stepsNeedingAttention(entry);

  const close = () => {
    if (inFlight.current) return;
    setMessage(null);
    setOpen(false);
  };

  const split = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await onSplit(entry);
      // On success the case study's card is replaced by its questions; the review says so.
      if (result.ok) setOpen(false);
      else setMessage(result.message);
    } catch {
      setMessage(UNEXPECTED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {entry.item === null ? (
        <p className="text-sm text-ink-1">
          Its patient record or a step could not be built. Split it into separate questions, or drop
          it.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {steps.map(({ step, why }) => (
          <Link
            key={step}
            href={stepHref(step)}
            aria-label={`${why === "key" ? `Add the key to step ${step}` : `Check step ${step}`} of ${heading}`}
            className={buttonClasses({ size: "sm" })}
          >
            {why === "key" ? `Add the key to step ${step}` : `Check step ${step}`}
          </Link>
        ))}
        <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          Split into separate questions
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={close}
        title="Split this case study?"
        description="Its 6 steps become 6 separate questions. The patient record is not attached to them. This cannot be undone."
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Keep the case study
            </Button>
            {/* aria-disabled, not disabled: a disabled button drops focus mid-request. */}
            <Button
              variant="primary"
              aria-disabled={busy || undefined}
              aria-describedby={message ? messageId : undefined}
              onClick={split}
            >
              {busy ? "Splitting…" : "Split"}
            </Button>
          </>
        }
      >
        {/* Always rendered: a region that appears with its text already in it is often not read. */}
        <div id={messageId} aria-live="polite">
          {message ? <FieldError>{message}</FieldError> : null}
        </div>
      </Dialog>
    </div>
  );
}
