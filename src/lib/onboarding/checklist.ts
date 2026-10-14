import { CLASSES_PATH } from "@/lib/classes/classes";
import { SAMPLE_BANK_NAME } from "./sampleBank";

/**
 * The Get started checklist on the author home (#265). Every step is worked out from the org's
 * own rows on each load, so nothing about onboarding is stored. Pure, so tests and the page share it.
 */

/** A bank as the author home already lists it, most recently edited first. */
export interface BankRef {
  id: string;
  name: string;
}

/** What the org has made so far: all the checklist needs to know. */
export interface OrgProgress {
  banks: readonly BankRef[];
  hasClass: boolean;
  hasAssignmentOrSession: boolean;
}

export type StepId = "bank" | "class" | "assign";

export interface ChecklistStep {
  id: StepId;
  title: string;
  /** One line on what the step means and where it is done. */
  hint: string;
  done: boolean;
  /** Where the step is done, or null when there is nowhere to go yet. */
  href: string | null;
  linkLabel: string;
  /** The org's existing Sample bank, which the bank step links to instead of importing again. */
  sampleBankId: string | null;
}

/** Holds the account id that hid the checklist on this browser; another account still sees it. */
export const GET_STARTED_COOKIE = "learn_get_started_hidden";
/** A year: long enough to mean "hidden", short enough that the browser forgets it eventually. */
export const GET_STARTED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function checklistSteps(progress: OrgProgress): ChecklistStep[] {
  const [latest] = progress.banks;
  const sample = progress.banks.find((bank) => bank.name === SAMPLE_BANK_NAME);
  return [
    {
      id: "bank",
      title: "Create a quiz or import the sample",
      hint: "The sample has one question of every type and a case study, published and ready to use.",
      done: progress.banks.length > 0,
      href: "#new-bank-heading",
      linkLabel: "New quiz",
      sampleBankId: sample?.id ?? null,
    },
    {
      id: "class",
      title: "Create a class",
      hint: "Students join with its class code or invite link.",
      done: progress.hasClass,
      href: CLASSES_PATH,
      linkLabel: "Go to your classes",
      sampleBankId: null,
    },
    {
      id: "assign",
      title: "Assign a quiz or start a live session",
      hint: latest
        ? "Do either from a quiz. Questions you write are used once you publish them."
        : "You need a quiz first.",
      done: progress.hasAssignmentOrSession,
      href: latest ? `/author/banks/${latest.id}` : null,
      linkLabel: latest ? `Open ${latest.name}` : "",
      sampleBankId: null,
    },
  ];
}

/** Shown until every step is done, unless this browser hid it. */
export function showChecklist(steps: readonly ChecklistStep[], hidden: boolean): boolean {
  return !hidden && steps.some((step) => !step.done);
}

/** Whether the cookie this browser holds hides the checklist for this account. */
export function hiddenFor(cookieValue: string | undefined, userId: string): boolean {
  return Boolean(cookieValue) && cookieValue === userId;
}
