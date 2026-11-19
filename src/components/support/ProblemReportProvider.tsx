"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ProblemReportState } from "@/lib/support/problemReportForm";
import { ProblemReportDialog, type ProblemAccess } from "./ProblemReportDialog";

export interface ProblemReportActions {
  send: (state: ProblemReportState, formData: FormData) => Promise<ProblemReportState>;
  /** Whether the person looking is signed in; for pages that read no session. */
  check: () => Promise<boolean>;
}

export interface OpenProblemForm {
  /** `signed-in` opens the form at once; `unknown` asks the server first. */
  audience: "signed-in" | "unknown";
  reference?: string;
  eventId?: string;
}

interface ProblemReportContextValue {
  openForm: (options: OpenProblemForm) => void;
  check: () => Promise<boolean>;
}

const ProblemReportContext = createContext<ProblemReportContextValue | null>(null);

/**
 * "Tell us about a problem" (#568) for every page below: one dialog for the whole app, opened from
 * an error screen, the account menu or the help page.
 *
 * The dialog lives here, not beside each opener, because the account menu is a native popover: a
 * modal opened inside it would be hidden with it. The server actions arrive as props from the root
 * layout, a Server Component, rather than being imported, so no browser bundle follows an import
 * into the mailer (`noClientEmail.test.ts`). The gallery passes fakes.
 */
export function ProblemReportProvider({
  actions,
  children,
}: {
  actions: ProblemReportActions;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<ProblemAccess>("checking");
  const [context, setContext] = useState<Pick<OpenProblemForm, "reference" | "eventId">>({});
  // A fresh form each time the dialog opens.
  const [opened, setOpened] = useState(0);
  const { check } = actions;

  const openForm = useCallback(
    ({ audience, reference, eventId }: OpenProblemForm) => {
      setContext({ reference, eventId });
      setOpened((count) => count + 1);
      setOpen(true);
      if (audience === "signed-in") {
        setAccess("signed-in");
        return;
      }
      setAccess("checking");
      check().then(
        (signedIn) => setAccess(signedIn ? "signed-in" : "signed-out"),
        () => setAccess("signed-out"),
      );
    },
    [check],
  );

  const value = useMemo(() => ({ openForm, check }), [openForm, check]);

  return (
    <ProblemReportContext value={value}>
      {children}
      <ProblemReportDialog
        key={opened}
        open={open}
        onClose={() => setOpen(false)}
        access={access}
        send={actions.send}
        reference={context.reference}
        eventId={context.eventId}
      />
    </ProblemReportContext>
  );
}

/** Opens the form, or null outside the provider (the global error page), where only email is offered. */
export function useOpenProblemForm(): ((options: OpenProblemForm) => void) | null {
  return useContext(ProblemReportContext)?.openForm ?? null;
}

/** Asks whether someone is signed in, for a public page that reads no session; null outside. */
export function useProblemSignedIn(): (() => Promise<boolean>) | null {
  return useContext(ProblemReportContext)?.check ?? null;
}
