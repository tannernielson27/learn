import Link from "next/link";
import type { ChecklistStep } from "@/lib/onboarding/checklist";
import { ImportSampleForm, type ImportSampleFormProps } from "./ImportSampleForm";

export interface GetStartedProps {
  steps: readonly ChecklistStep[];
  importSample: ImportSampleFormProps["action"];
  hide: () => Promise<void>;
}

const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink underline-offset-2 hover:underline";

/**
 * The first-run checklist at the top of the author home (#265): three steps, each done or not
 * done in words as well as a mark, each linking to where it is done. The page decides whether it
 * shows at all; this only draws it.
 */
export function GetStarted({ steps, importSample, hide }: GetStartedProps) {
  const done = steps.filter((step) => step.done).length;
  return (
    <section
      aria-labelledby="get-started-heading"
      className="mb-8 rounded-md border border-line bg-surface-1 px-4 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="get-started-heading" className="font-read text-xl text-ink-1">
          Get started
        </h2>
        <p className="text-sm text-ink-2">
          {done} of {steps.length} done
        </p>
      </div>
      <ol aria-label="Steps" className="mt-3 flex flex-col divide-y divide-line">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-3 py-3">
            <StepMark done={step.done} number={index + 1} />
            <div className="flex min-w-0 flex-col items-start gap-1">
              <p className="font-medium text-ink-1">{step.title}</p>
              <p className="text-sm text-ink-2">
                <span className={step.done ? "font-medium text-ink-1" : undefined}>
                  {step.done ? "Done" : "Not done"}
                </span>
              </p>
              <p className="max-w-prose text-sm text-ink-2">{step.hint}</p>
              <StepActions step={step} importSample={importSample} />
            </div>
          </li>
        ))}
      </ol>
      <form action={hide} className="mt-2 border-t border-line pt-3">
        <button type="submit" className={LINK}>
          Hide this
        </button>
      </form>
    </section>
  );
}

function StepActions({
  step,
  importSample,
}: {
  step: ChecklistStep;
  importSample: GetStartedProps["importSample"];
}) {
  if (step.id !== "bank") {
    return step.href ? (
      <Link href={step.href} className={LINK}>
        {step.linkLabel}
      </Link>
    ) : null;
  }
  return (
    <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-2">
      {step.sampleBankId ? (
        <Link href={`/author/banks/${step.sampleBankId}`} className={LINK}>
          Open the sample bank
        </Link>
      ) : (
        <ImportSampleForm action={importSample} />
      )}
      {step.href ? (
        <a href={step.href} className={LINK}>
          {step.linkLabel}
        </a>
      ) : null}
    </div>
  );
}

/** A numbered circle, filled with a check once done. Decorative: the words say the same. */
function StepMark({ done, number }: { done: boolean; number: number }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border text-sm ${
        done ? "border-ink-1 bg-ink-1 text-surface-1" : "border-line-strong text-ink-2"
      }`}
    >
      {done ? (
        <svg
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 10.5l3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        number
      )}
    </span>
  );
}
