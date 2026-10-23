"use client";

import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import {
  CASE_STUDY_STEPS,
  TAB_ACCESSES,
  TAB_ACCESS_LABELS,
  describeStepAccess,
  stepAccessOf,
} from "@/lib/authoring/forms/ehrSteps";
import type { TabAccess } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";
import { Sr, fieldClass, type FieldHelpers } from "./EhrBlockEditors";

/**
 * A case study's step controls (#336), shown only in the case study's patient record editor: an
 * item's record cannot have steps. Native selects, as the rest of the record editor uses, so each
 * is one 44px control that reads its value aloud ("Lab Results, Step 3, Locked") and needs no
 * colour to say what it is set to.
 */

export interface FromStepSelectProps {
  /** Form path of the field, e.g. "timePoints.0.fromStep". */
  field: string;
  /** Words only a screen reader hears before "Shows from", e.g. "Time point 1, ". */
  where: string;
  fromStep: CjmmStep | undefined;
  fields: FieldHelpers;
  onChange: (step: CjmmStep) => void;
}

/** "Shows from" Step 1 to Step 6, for a time point or a block. */
export function FromStepSelect({ field, where, fromStep, fields, onChange }: FromStepSelectProps) {
  const id = fields.idFor(field);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink-1">
        <Sr>{where}</Sr>
        Shows from
      </label>
      <select
        id={id}
        className={`tap-target ${fieldClass}`}
        value={String(fromStep ?? 1)}
        aria-invalid={fields.invalid(field)}
        aria-describedby={fields.describedBy(field)}
        onChange={(event) => onChange(Number(event.target.value) as CjmmStep)}
      >
        {CASE_STUDY_STEPS.map((step) => (
          <option key={step} value={String(step)}>
            Step {step}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface TabStepAccessProps {
  /** Form path of the tab, e.g. "tabs.2". */
  path: string;
  /** The tab's name as a screen reader hears it: its title, or "Tab 3" until it has one. */
  name: string;
  stepAccess: readonly TabAccess[] | undefined;
  fields: FieldHelpers;
  onChange: (step: CjmmStep, access: TabAccess) => void;
}

/**
 * A tab's six-step row: Hidden, Locked or Open at each step, each step its own choice, so a tab
 * may open, lock and open again. Folded under a line that says the row in words; two columns at
 * 375px, three on a narrow form column, six where the form is wide, sized by the row's own width
 * so it never scrolls sideways.
 */
export function TabStepAccess({ path, name, stepAccess, fields, onChange }: TabStepAccessProps) {
  const access = stepAccessOf(stepAccess);
  return (
    <details className="group rounded-md border border-line">
      <summary className="tap-target flex cursor-pointer items-center gap-2 px-3 text-sm text-ink-1 hover:bg-surface-2">
        {/* Turned up while the row is open. Not animated. */}
        <Icon icon={ChevronDown} className="text-ink-2 group-open:rotate-180" />
        <Sr>{`${name}: `}</Sr>
        <span>{describeStepAccess(stepAccess)}</span>
      </summary>
      <fieldset className="border-t border-line p-3">
        <legend className="sr-only">{`${name}, Steps 1 to 6`}</legend>
        {/* The container is a div: a fieldset is not a dependable query container everywhere. */}
        <div className="@container">
          <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @2xl:grid-cols-6">
            {CASE_STUDY_STEPS.map((step) => {
              const field = `${path}.stepAccess.${step - 1}`;
              const id = fields.idFor(field);
              return (
                <div key={step} className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={id} className="text-sm text-ink-1">
                    <Sr>{`${name}, `}</Sr>
                    Step {step}
                  </label>
                  <select
                    id={id}
                    className={`tap-target ${fieldClass}`}
                    value={access[step - 1]}
                    aria-invalid={fields.invalid(field)}
                    aria-describedby={fields.describedBy(field)}
                    onChange={(event) => onChange(step, event.target.value as TabAccess)}
                  >
                    {TAB_ACCESSES.map((value) => (
                      <option key={value} value={value}>
                        {TAB_ACCESS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </fieldset>
    </details>
  );
}
