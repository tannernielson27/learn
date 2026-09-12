"use client";

import { useState, useSyncExternalStore } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { hasRenderer } from "@/components/question/registry";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { SCORING_MODEL_LABELS } from "@/lib/ngn/labels";
import type { AnyResponse, Item, ItemType } from "@/lib/ngn/schemas";

const VARIANTS = [
  { value: "canonical", label: "Canonical" },
  { value: "edge", label: "Edge case" },
] as const;

type Variant = (typeof VARIANTS)[number]["value"];

/** Feedback is reached by submitting, so it is not one of the modes you can switch into here. */
const MODES = [
  { value: "answer", label: "Answer" },
  { value: "review", label: "Review" },
] as const;

type Mode = (typeof MODES)[number]["value"];

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before screenshots. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

/**
 * Gallery-only harness. Scores locally with the answer key in the browser, which is fine here
 * and never acceptable in sessions or assignments.
 */
export function ItemPlayground({
  type,
  items,
}: {
  type: ItemType;
  /** Already parsed by the server page, which keeps fixtures and zod out of this bundle. */
  items: Record<Variant, Item>;
}) {
  const [variant, setVariant] = useState<Variant>("canonical");
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>("answer");
  // Held here so review mode can replay it: the player itself is remounted to change mode.
  const [response, setResponse] = useState<AnyResponse | undefined>(undefined);
  const hydrated = useHydrated();
  const item = items[variant];
  const model = SCORING_MODEL_LABELS[item.scoring.model];

  if (!hasRenderer(type)) {
    return (
      <div
        data-hydrated={hydrated}
        className="mt-6 rounded-md border border-dashed border-line-strong p-6"
      >
        <p className="text-sm font-medium">Renderer not built yet</p>
        <p className="mt-1 text-sm text-ink-2">
          The schema, scorer and fixtures for this type are in place. The renderer is a Sprint 1 or
          Sprint 2 story.
        </p>
        <p className="mt-3 text-sm text-ink-2">
          Scoring: {model.name}, {item.scoring.maxPoints} points max.
        </p>
      </div>
    );
  }

  return (
    <div data-hydrated={hydrated} className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Fixture"
          size="sm"
          options={VARIANTS}
          value={variant}
          onChange={(next) => {
            setVariant(next);
            setResponse(undefined);
            setMode("answer");
            setAttempt((n) => n + 1);
          }}
        />
        <SegmentedControl label="Mode" size="sm" options={MODES} value={mode} onChange={setMode} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setResponse(undefined);
            setMode("answer");
            setAttempt((n) => n + 1);
          }}
        >
          Reset
        </Button>
        <span className="ml-auto font-mono text-xs text-ink-2">
          {model.name} · max {item.scoring.maxPoints}
        </span>
      </div>
      <div className="mt-6 rounded-md border border-line bg-surface-1 p-5 sm:p-6">
        <ItemPlayer
          key={`${type}-${variant}-${attempt}-${mode}`}
          item={item}
          initialMode={mode}
          initialResponse={response}
          onResponseChange={setResponse}
        />
      </div>
    </div>
  );
}
