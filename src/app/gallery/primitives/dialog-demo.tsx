"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before clicking. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

/** Stand-in copy: the real welcomes are #364 and #365. */
const STEPS = [
  {
    title: "A stepped dialog",
    body: "The caller holds the step number and swaps the title and this text to match it.",
  },
  {
    title: "Back appears from step two",
    body: "Next keeps the focus from step to step, so Enter walks the whole flow.",
  },
  {
    title: "The last button is the caller’s",
    body: "Its label and what it does belong to the flow, as do Skip, Close and Escape.",
  },
] as const;

export function DialogDemo() {
  const hydrated = useHydrated();
  const [plain, setPlain] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [last, setLast] = useState("Nothing yet");

  const end = (how: string) => {
    setStep(null);
    setLast(how);
  };
  const shown = STEPS[(step ?? 1) - 1];

  return (
    <section className="mt-10" data-hydrated={hydrated}>
      <h2 className="text-lg font-semibold">Dialog</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        A sheet off the bottom edge on a phone and a centred card from 768px. Escape and the close
        button ask the caller to close it; focus returns to the button that opened it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => setPlain(true)}>Open dialog</Button>
        <Button onClick={() => setStep(1)}>Open stepped dialog</Button>
        <span className="font-mono text-xs text-ink-2">
          Last stepped result: <span data-dialog-result="">{last}</span>
        </span>
      </div>

      <Dialog
        open={plain}
        onClose={() => setPlain(false)}
        title="Archive this class?"
        description="Students keep their results, and you can restore the class later."
        actions={
          <>
            <Button onClick={() => setPlain(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setPlain(false)}>
              Archive
            </Button>
          </>
        }
      />

      <Dialog
        open={step !== null}
        onClose={() => end("Closed")}
        title={shown.title}
        steps={{
          current: step ?? 1,
          total: STEPS.length,
          onNext: () => setStep((n) => (n ?? 1) + 1),
          onBack: () => setStep((n) => (n ?? 2) - 1),
          onFinish: () => end("Finished"),
          onSkip: () => end("Skipped"),
          finishLabel: "Get started",
        }}
      >
        <p className="max-w-prose">{shown.body}</p>
      </Dialog>
    </section>
  );
}
