"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { CjmmStep } from "@/lib/ngn/types";
import { StepTypeChooser } from "./StepTypeChooser";

export interface StepItemPanelProps {
  caseStudyId: string;
  position: CjmmStep;
  /** The step item's type, as authors know it ("Matrix Multiple Choice"). */
  typeLabel: string;
  /** The item's editor. */
  children: ReactNode;
}

type Mode = "edit" | "confirm" | "choose";

/**
 * A step that has an item: its type, its editor, and a way to change the type. Changing it starts
 * a new item, so the author is told what will be lost before any type is offered.
 */
export function StepItemPanel({ caseStudyId, position, typeLabel, children }: StepItemPanelProps) {
  const ids = useId();
  const [mode, setMode] = useState<Mode>("edit");
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
            Change type
          </Button>
        ) : null}
      </div>

      {mode === "confirm" ? (
        <div className="flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4">
          <p className="text-sm text-ink-1">
            Changing the type starts a new item for this step. Its question and answers will be
            lost.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode("choose")}>
              Choose another type
            </Button>
            <Button id={keepId} size="sm" variant="ghost" onClick={() => setMode("edit")}>
              Keep this item
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "choose" ? (
        <>
          <StepTypeChooser caseStudyId={caseStudyId} position={position} />
          <div>
            <Button id={keepId} size="sm" variant="ghost" onClick={() => setMode("edit")}>
              Keep this item
            </Button>
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
