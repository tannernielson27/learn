"use client";

import { useState, useSyncExternalStore } from "react";
import { EmailSupport } from "@/components/support/EmailSupport";
import { ProblemReportDialog, type ProblemAccess } from "@/components/support/ProblemReportDialog";
import { Button } from "@/components/ui/Button";
import {
  PROBLEM_COPY,
  PROBLEM_IDLE,
  type ProblemReportState,
} from "@/lib/support/problemReportForm";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before clicking. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

const REPLY_TO = "ada.brennan@example.edu";

interface Specimen {
  id: string;
  label: string;
  access: ProblemAccess;
  state: ProblemReportState;
  reference?: string;
}

const SPECIMENS: readonly Specimen[] = [
  { id: "empty", label: "Empty", access: "signed-in", state: PROBLEM_IDLE },
  {
    id: "from-error",
    label: "From an error screen",
    access: "signed-in",
    state: PROBLEM_IDLE,
    reference: "1234567890",
  },
  {
    id: "too-short",
    label: "Too short",
    access: "signed-in",
    state: { status: "invalid", error: PROBLEM_COPY.messageTooShort },
  },
  {
    id: "rate-limited",
    label: "Too many",
    access: "signed-in",
    state: { status: "rate_limited", error: PROBLEM_COPY.rateLimited },
  },
  {
    id: "failed",
    label: "Did not send",
    access: "signed-in",
    state: { status: "error", error: PROBLEM_COPY.failed },
  },
  { id: "sent", label: "Sent", access: "signed-in", state: { status: "sent", replyTo: REPLY_TO } },
  { id: "checking", label: "Checking", access: "checking", state: PROBLEM_IDLE },
  { id: "signed-out", label: "Signed out", access: "signed-out", state: PROBLEM_IDLE },
];

/** Answers as the server would for a message long enough, after a pause, and mails nothing. */
async function fakeSend(_state: ProblemReportState, formData: FormData) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const message = String(formData.get("message") ?? "").trim();
  return message.length < 10
    ? ({ status: "invalid", error: PROBLEM_COPY.messageTooShort } as const)
    : ({ status: "sent", replyTo: REPLY_TO } as const);
}

export function SupportDemo() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState<Specimen | null>(null);
  const [opened, setOpened] = useState(0);

  return (
    <div data-hydrated={hydrated ? "true" : "false"} className="mt-8 flex flex-col gap-10">
      <section aria-labelledby="support-states">
        <h2 id="support-states" className="text-lg font-semibold">
          The form, in each state
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          The send here is fake: it waits, then thanks you, and mails nothing.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SPECIMENS.map((specimen) => (
            <Button
              key={specimen.id}
              data-specimen={specimen.id}
              onClick={() => {
                setOpened((count) => count + 1);
                setOpen(specimen);
              }}
            >
              {specimen.label}
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="support-email">
        <h2 id="support-email" className="text-lg font-semibold">
          Email only
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          For a guest in a live session and the global error page.
        </p>
        <div className="mt-4">
          <EmailSupport reference="1234567890" />
        </div>
      </section>

      <ProblemReportDialog
        key={opened}
        open={open !== null}
        onClose={() => setOpen(null)}
        access={open?.access ?? "signed-in"}
        send={fakeSend}
        reference={open?.reference}
        initialState={open?.state}
      />
    </div>
  );
}
