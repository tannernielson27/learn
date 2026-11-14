import { SIGN_UP_PATH } from "@/lib/auth/accountPaths";
import type { LandingEntry } from "@/lib/auth/landing";

/**
 * The subscription in the words the public pages use (ADR 0016, owner facts of 2026-10-29), said
 * once so the landing page and /pricing cannot drift apart. Every line is true today.
 */
export const OFFER = {
  price: "$39.99",
  per: "a month per workspace",
  teachers: "Up to 10 teachers",
  trial: "7-day free trial",
  students: "Free for students",
  /** Who LeaRN is for (#563), as the landing page and /pricing say it. */
  audience: "For nursing faculty teaching for the Next Generation NCLEX",
} as const;

/** The glossary's words for the first step of a subscription (docs/glossary.md, Free trial). */
export const START_TRIAL = "Start your free trial";

/**
 * The public pages' main action (#563). A visitor's first link is sign-up (`landingEntry`), which
 * is where a free trial starts, so it is named for that; anyone signed in keeps their own home and
 * its label. Where the link goes is `landingEntry`'s alone: this changes only the words.
 */
export function trialEntry(entry: LandingEntry): LandingEntry {
  return entry.href === SIGN_UP_PATH ? { ...entry, label: START_TRIAL } : entry;
}
