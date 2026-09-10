"use client";

import { useId } from "react";
import { OptionRow } from "../OptionRow";
import { elementFeedback, type ItemRendererModule, type ItemRendererProps } from "../types";

export function MultipleChoiceItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"multiple_choice">) {
  const groupId = useId();
  const correctId = item.answerKey?.correctOptionId;
  return (
    <div role="radiogroup" aria-label="Options" className="flex flex-col gap-2">
      {item.content.options.map((option, index) => {
        const selected = response.optionId === option.id;
        return (
          <OptionRow
            key={option.id}
            id={`${groupId}-${option.id}`}
            name={groupId}
            kind="radio"
            marker={String.fromCharCode(65 + index)}
            label={option.label}
            checked={selected}
            mode={mode}
            feedback={elementFeedback(selected, option.id === correctId, mode)}
            onToggle={() => onChange({ type: "multiple_choice", optionId: option.id })}
          />
        );
      })}
    </div>
  );
}

export const multipleChoiceModule: ItemRendererModule<"multiple_choice"> = {
  Renderer: MultipleChoiceItem,
  isComplete: (_item, response) => response.optionId !== undefined,
};
