"use client";

import { useId } from "react";
import { ITEM_TYPE_GROUPS, isEditorReady } from "@/lib/authoring/itemTypeGroups";
import { ITEM_TYPE_LABELS, type ItemType } from "@/lib/ngn/labels";

export interface NewItemPickerProps {
  onChoose: (type: ItemType) => void;
  /** Disables every choice while a draft is being created. */
  busy?: boolean;
}

const COMING_LATER = "Editor coming in Sprint 5";

export function NewItemPicker({ onChoose, busy = false }: NewItemPickerProps) {
  const laterId = useId();
  return (
    <div className="flex flex-col gap-6">
      <p id={laterId} hidden>
        {COMING_LATER}
      </p>
      {ITEM_TYPE_GROUPS.map((group) => (
        <fieldset key={group.label} className="flex flex-col gap-2">
          <legend className="eyebrow mb-1">{group.label}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.types.map((type) => {
              const ready = isEditorReady(type);
              const unavailable = !ready || busy;
              return (
                <button
                  key={type}
                  type="button"
                  aria-disabled={unavailable}
                  aria-describedby={ready ? undefined : laterId}
                  onClick={() => {
                    if (!unavailable) onChoose(type);
                  }}
                  className={`tap-target flex items-center justify-between gap-3 rounded-sm border px-3 text-left text-base transition-colors duration-fast ${
                    ready
                      ? "border-line bg-surface-1 text-ink-1 hover:border-line-strong hover:bg-surface-2"
                      : "cursor-not-allowed border-line bg-surface-0 text-ink-2"
                  }`}
                >
                  <span>{ITEM_TYPE_LABELS[type]}</span>
                  {ready ? null : (
                    <span aria-hidden="true" className="shrink-0 font-mono text-xs">
                      Sprint 5
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
