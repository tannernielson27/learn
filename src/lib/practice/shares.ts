import { isUuid } from "@/lib/authoring/ids";

/**
 * Words and parsing for sharing a bank with a class for practice (#240). Pure: the reads and
 * writes are in `src/lib/supabase/practiceShares.ts`, and the database decides who may share.
 */

/** Which classes can see the answers to part of an assignment in practice, and to how many items. */
export interface PracticeExposure {
  classNames: readonly string[];
  exposedItems: number;
}

/** Why a share could not be made. `gone` is a bank or class the author cannot see. */
export type ShareFailure = "gone" | "rate_limited" | "failed";

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The assign form's warning (owner decision 2026-09-24: warn, never block), or null when no class
 * can see any of the answers.
 */
export function practiceWarning(exposure: PracticeExposure): string | null {
  if (exposure.classNames.length === 0 || exposure.exposedItems <= 0) return null;
  const answers = exposure.exposedItems === 1 ? "the answer" : "the answers";
  return `Students in ${joinNames(exposure.classNames)} can see ${answers} to ${exposure.exposedItems} of these items in practice.`;
}

/** The bank list's and bank page's badge, or null for a bank shared with nobody. */
export function sharedBadge(classNames: readonly string[]): string | null {
  if (classNames.length === 0) return null;
  return `Shared for practice with ${joinNames(classNames)}`;
}

/** What the Stop sharing confirmation says before it happens. */
export function stopSharingWarning(className: string, bankName: string): string {
  return `Students in ${className} lose ${bankName} from practice at once. Answers they have already seen stay seen.`;
}

/** The class (on the bank page) or the bank (on the class page) chosen in a share form. */
export function parseShareTarget(formData: FormData): { ok: true; id: string } | { ok: false } {
  const value = formData.get("target");
  if (typeof value !== "string" || !isUuid(value)) return { ok: false };
  return { ok: true, id: value };
}

const REFUSALS: Readonly<Record<ShareFailure, string>> = {
  gone: "That bank or class no longer exists. Reload the page.",
  rate_limited: "That is too many changes in a minute. Wait a moment and try again.",
  failed: "The bank could not be shared. Try again.",
};

export function shareRefusal(reason: ShareFailure): string {
  return REFUSALS[reason];
}
