"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { CjmmStep } from "@/lib/ngn/types";
import { ItemEditorHostContext, useItemEditorHost, type ItemEditorHost } from "./ItemEditorHost";
import { StepTypeChooser } from "./StepTypeChooser";

export interface StepItemPanelProps {
  caseStudyId: string;
  position: CjmmStep;
  /** The step question's format, as teachers know it ("Matrix Multiple Choice"). */
  typeLabel: string;
  /** The question is published, so saving a draft of it would unpublish it (#413). */
  published?: boolean;
  /** The item's editor. */
  children: ReactNode;
}

type Mode = "edit" | "confirm" | "choose";

/**
 * A step that has a question: its format, its editor, and a way to change the format. Changing it
 * starts a new question, so the teacher is told what will be lost before any format is offered.
 * It tells the editor whether the question is published, so saving a draft warns first, as it does
 * on a question's own page.
 */
export function StepItemPanel({
  caseStudyId,
  position,
  typeLabel,
  published: openedPublished = false,
  children,
}: StepItemPanelProps) {
  const ids = useId();
  const [mode, setMode] = useState<Mode>("edit");
  const [published, setPublished] = useState(openedPublished);
  const builder = useItemEditorHost();
  const host = useMemo<ItemEditorHost>(
    () => ({ ...builder, published, onPublishedChange: setPublished }),
    [builder, published],
  );
  const shown = useRef<Mode>("edit");
  const changeId = `${ids}-change`;
  const keepId = `${ids}-keep`;

  // The pressed button disappears in every move, so focus goes to what replaced it.
  useEffect(() => {
    if (shown.current === mode) return;
    shown.current = mode;
    const target = mode === "edit" ? changeId : keepId;
    document.getElementById(target)?.focus();
  }, [mode, changeId, keepId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-1">{typeLabel}</p>
        {mode === "edit" ? (
          <Button id={changeId} size="sm" variant="ghost" onClick={() => setMode("confirm")}>
            Change format
          </Button>
        ) : null}
      </div>

      {mode === "confirm" ? (
        <div className="flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4">
          <p className="text-sm text-ink-1">
            A new format starts a new question for Step {position}. This one&apos;s text and answers
            will be lost.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode("choose")}>
              Choose another format
            </Button>
            <Button id={keepId} size="sm" variant="ghost" onClick={() => setMode("edit")}>
              Keep this question
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "choose" ? (
        <>
          <StepTypeChooser caseStudyId={caseStudyId} position={position} />
          <div>
            <Button id={keepId} size="sm" variant="ghost" onClick={() => setMode("edit")}>
              Keep this question
            </Button>
          </div>
        </>
      ) : (
        <ItemEditorHostContext.Provider value={host}>{children}</ItemEditorHostContext.Provider>
      )}
    </div>
  );
}
