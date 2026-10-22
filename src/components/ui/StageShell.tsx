import type { ReactNode } from "react";

export interface StageShellProps {
  /** What the stage is, for a screen reader: "Projector view". */
  label?: string;
  children: ReactNode;
  className?: string;
}

/**
 * The projector view's frame (owner decision 3): the whole viewport, always light, and a
 * `container-type: size` region so every stage size (`text-stage-*`, `--stage-pad-*`) scales with
 * the screen it is shown on rather than the window's width alone (PLAN §6).
 *
 * Always light because projectors cannot make black and dark slides wash out in a lit room:
 * `data-theme="light"` re-lights the tokens here whatever the page's theme is.
 *
 * Two elements, because a container's own padding cannot be in its own container units: the outer
 * one is the container, the inner one holds the safe area, 60px and 80px on a 1920×1080 stage.
 */
export function StageShell({
  label = "Projector view",
  children,
  className = "",
}: StageShellProps) {
  return (
    <div
      data-theme="light"
      data-stage=""
      aria-label={label}
      role="region"
      className="fixed inset-0 overflow-hidden bg-stage-surface text-stage-ink [container-type:size]"
    >
      <div
        className={`flex h-full flex-col px-(--stage-pad-inline) py-(--stage-pad-block) ${className}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
