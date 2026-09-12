"use client";

import { useId } from "react";
import { OptionRow } from "../OptionRow";
import { elementFeedback, type ItemRendererModule, type ItemRendererProps } from "../types";

export function MultipleResponseItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"multiple_response">) {
  const groupId = useId();
  const correct = new Set(item.answerKey?.correctOptionIds ?? []);
  const selected = new Set(response.optionIds);
  const cap = item.content.variant === "select_n" ? item.content.n : undefined;
  const capReached = cap !== undefined && selected.size >= cap;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (!capReached) next.add(id);
    onChange({ type: "multiple_response", optionIds: [...next] });
  };

  return (
    <div>
      <div role="group" aria-label="Options" className="flex flex-col gap-2">
        {item.content.options.map((option) => {
          const isSelected = selected.has(option.id);
          return (
            <OptionRow
              key={option.id}
              id={`${groupId}-${option.id}`}
              name={groupId}
              kind="checkbox"
              label={option.label}
              checked={isSelected}
              disabled={capReached && !isSelected}
              mode={mode}
              feedback={elementFeedback(isSelected, correct.has(option.id), mode)}
              rationale={item.rationale?.perElement?.[option.id]}
              onToggle={() => toggle(option.id)}
            />
          );
        })}
      </div>
      {cap !== undefined && mode === "answer" ? (
        <p className="mt-3 text-sm text-ink-2" aria-live="polite">
          {selected.size} of {cap} selected
          {capReached ? ". Deselect an option to choose a different one." : "."}
        </p>
      ) : null}
    </div>
  );
}

export const multipleResponseModule: ItemRendererModule<"multiple_response"> = {
  Renderer: MultipleResponseItem,
  isComplete: (item, response) => {
    if (item.content.variant === "select_n") return response.optionIds.length === item.content.n;
    return response.optionIds.length > 0;
  },
};
