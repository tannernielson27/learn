"use client";

import { useState } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { hasRenderer } from "@/components/question/registry";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { SCORING_MODEL_LABELS } from "@/lib/ngn/registry";
import { itemSchema, type ItemType } from "@/lib/ngn/schemas";

const VARIANTS = [
  { value: "canonical", label: "Canonical" },
  { value: "edge", label: "Edge case" },
] as const;

type Variant = (typeof VARIANTS)[number]["value"];

/**
 * Gallery-only harness. Scores locally with the answer key in the browser, which is fine here
 * and never acceptable in sessions or assignments.
 */
export function ItemPlayground({ type }: { type: ItemType }) {
  const [variant, setVariant] = useState<Variant>("canonical");
  const [attempt, setAttempt] = useState(0);
  const fixture = FIXTURES[type];
  const item = itemSchema.parse(fixture[variant]);
  const model = SCORING_MODEL_LABELS[item.scoring.model];

  if (!hasRenderer(type)) {
    return (
      <div className="mt-6 rounded-md border border-dashed border-line-strong p-6">
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
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Fixture"
          size="sm"
          options={VARIANTS}
          value={variant}
          onChange={(next) => {
            setVariant(next);
            setAttempt((n) => n + 1);
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
          Reset
        </Button>
        <span className="ml-auto font-mono text-xs text-ink-2">
          {model.name} · max {item.scoring.maxPoints}
        </span>
      </div>
      <div className="mt-6 rounded-md border border-line bg-surface-1 p-5 sm:p-6">
        <ItemPlayer key={`${type}-${variant}-${attempt}`} item={item} />
      </div>
    </div>
  );
}
