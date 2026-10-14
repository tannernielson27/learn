/**
 * When each part of a case study's patient record shows (#336): a tab's access at each of the six
 * steps, and the step a time point or block first shows at. The record's meaning is #334's
 * (`src/lib/ngn/chartReveal.ts`); these only change the form. Step 1 and Open at every step are
 * the defaults, and the form holds neither, so they save nothing.
 */
import { CASE_STUDY_STEP_COUNT, FIRST_STEP, type TabAccess } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";
import { fromStepField, stepAccessField, type EhrBlockForm, type EhrFormValues } from "./ehr";

/** The six steps, first first. */
export const CASE_STUDY_STEPS: readonly CjmmStep[] = Array.from(
  { length: CASE_STUDY_STEP_COUNT },
  (_, index) => (index + FIRST_STEP) as CjmmStep,
);

export const TAB_ACCESS_LABELS: Record<TabAccess, string> = {
  hidden: "Hidden",
  locked: "Locked",
  open: "Open",
};
export const TAB_ACCESSES = Object.keys(TAB_ACCESS_LABELS) as TabAccess[];

/** A tab's access at each step, open where it says nothing. */
export function stepAccessOf(stepAccess: readonly TabAccess[] | undefined): TabAccess[] {
  return CASE_STUDY_STEPS.map((step) => stepAccess?.[step - FIRST_STEP] ?? "open");
}

/** A tab's access with one step changed; open at every step leaves the field off. */
export function setTabStepAccess(
  values: EhrFormValues,
  tabIndex: number,
  step: CjmmStep,
  access: TabAccess,
): EhrFormValues {
  return {
    ...values,
    tabs: values.tabs.map((tab, at) => {
      if (at !== tabIndex) return tab;
      const next = stepAccessOf(tab.stepAccess).map((current, index) =>
        index === step - FIRST_STEP ? access : current,
      );
      const rest = { ...tab };
      delete rest.stepAccess;
      return { ...rest, ...stepAccessField(next) };
    }),
  };
}

/** A time point shown from a step; Step 1 leaves the field off. */
export function setTimePointFromStep(
  values: EhrFormValues,
  index: number,
  step: CjmmStep,
): EhrFormValues {
  return {
    ...values,
    timePoints: values.timePoints.map((point, at) =>
      at === index ? { id: point.id, label: point.label, ...fromStepField(step) } : point,
    ),
  };
}

/** A block shown from a step; Step 1 leaves the field off. */
export function setBlockFromStep(block: EhrBlockForm, step: CjmmStep): EhrBlockForm {
  const rest = { ...block };
  delete rest.fromStep;
  return { ...rest, ...fromStepField(step) };
}

const stepsText = (first: number, last: number) =>
  first === last ? `Step ${first}` : `Steps ${first}–${last}`;

/**
 * A tab's access in a few words, runs of steps together: "Hidden at Step 1, locked at Step 2,
 * open at Steps 3–6". Said on the tab's step row, so the row reads without opening it.
 */
export function describeStepAccess(stepAccess: readonly TabAccess[] | undefined): string {
  const access = stepAccessOf(stepAccess);
  const runs: { access: TabAccess; first: number; last: number }[] = [];
  access.forEach((value, index) => {
    const step = index + FIRST_STEP;
    const last = runs.at(-1);
    if (last && last.access === value) runs[runs.length - 1] = { ...last, last: step };
    else runs.push({ access: value, first: step, last: step });
  });
  const text = runs
    .map(
      (run) =>
        `${TAB_ACCESS_LABELS[run.access].toLowerCase()} at ${stepsText(run.first, run.last)}`,
    )
    .join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
