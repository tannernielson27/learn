"use client";

import { useState, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CountdownBar, CountdownBarView } from "@/components/ui/CountdownBar";
import { Notice } from "@/components/ui/Notice";
import { Sheet } from "@/components/ui/Sheet";
import { Toast } from "@/components/ui/Toast";
import { countdownReading } from "@/lib/live/countdown";
import type { ItemTimer } from "@/lib/live/timer";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before clicking. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

/** A running 25-second clock that starts when asked, on this page's own clock. */
function useDemoTimer(): [ItemTimer | null, () => void] {
  const [timer, setTimer] = useState<ItemTimer | null>(null);
  return [timer, () => setTimer({ seconds: 25, endsAt: Date.now() + 25_000, remainingMs: null })];
}

const now = () => Date.now();

/** The molecules that need a browser: the countdown, the toast, the confirm and the sheet. */
export function FoundationDemo() {
  const hydrated = useHydrated();
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sheet, setSheet] = useState<"bottom" | "end" | null>(null);
  const [last, setLast] = useState("Nothing yet");
  const [timer, startTimer] = useDemoTimer();

  return (
    <>
      <section className="mt-10" aria-labelledby="countdown-h">
        <h2 id="countdown-h" className="text-lg font-semibold">
          CountdownBar
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          The time is always text beside the bar. The last ten seconds turn the bar amber and say so
          in words; nothing pulses.
        </p>
        <div className="mt-3 grid max-w-xl gap-4">
          <CountdownBarView reading={countdownReading(21_000, 30_000)} />
          <CountdownBarView reading={countdownReading(8_000, 30_000)} />
          {timer ? <CountdownBar timer={timer} now={now} /> : null}
          <div>
            <Button onClick={startTimer} disabled={!hydrated}>
              Start a 25-second clock
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="notice-h">
        <h2 id="notice-h" className="text-lg font-semibold">
          Notice and Toast
        </h2>
        <div className="mt-3 grid max-w-xl gap-3">
          <Notice>System messages use this neutral notice, never feedback red.</Notice>
          <Notice title="Reconnecting" icon={WifiOff}>
            Stay on this page. Your answer is kept.
          </Notice>
          <div>
            <Button onClick={() => setToast("Saved")} disabled={!hydrated}>
              Show a toast
            </Button>
          </div>
        </div>
        <Toast message={toast} onDismiss={() => setToast(null)} />
      </section>

      <section className="mt-10" aria-labelledby="confirm-h">
        <h2 id="confirm-h" className="text-lg font-semibold">
          ConfirmDialog and Sheet
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button onClick={() => setConfirming(true)} disabled={!hydrated}>
            Ask to confirm
          </Button>
          <Button onClick={() => setSheet("bottom")} disabled={!hydrated}>
            Open a bottom sheet
          </Button>
          <Button onClick={() => setSheet("end")} disabled={!hydrated}>
            Open a side sheet
          </Button>
        </div>
        <p className="mt-2 text-sm text-ink-2" role="status">
          Last: {last}
        </p>
        <ConfirmDialog
          open={confirming}
          title="End this live session?"
          description="Phones stop taking answers and the report opens."
          confirmLabel="End live session"
          onConfirm={() => {
            setConfirming(false);
            setLast("Confirmed");
          }}
          onCancel={() => {
            setConfirming(false);
            setLast("Cancelled");
          }}
        />
        <Sheet
          open={sheet !== null}
          side={sheet ?? "bottom"}
          onClose={() => setSheet(null)}
          title="Patient record"
        >
          <p className="ehr-note">Vital signs at 08:00: BP 148/92, HR 104, RR 24, SpO2 91%.</p>
        </Sheet>
      </section>
    </>
  );
}
