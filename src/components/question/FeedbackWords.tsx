"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the renderers print "Correct", "Incorrect" and "Missed" on screen beside their icons.
 * On by default: colour and an icon were not enough right after submit, where a student decides
 * at a glance whether they got it, and "Missed" is the one state no icon says well. The words are
 * always in each element's accessible name as well. `ShowFeedbackWords` predates the default and
 * still wraps the take-home results page (#210).
 */
const FeedbackWordsContext = createContext(true);

/** Wrap a review to print the feedback words on screen. */
export function ShowFeedbackWords({ children }: { children: ReactNode }) {
  return <FeedbackWordsContext value={true}>{children}</FeedbackWordsContext>;
}

const VISIBLE = "ml-2 shrink-0 text-sm font-medium text-ink-1";

/** The class for a renderer's feedback word: visible unless a context turns the words off. */
export function useFeedbackWordClass(): string {
  return useContext(FeedbackWordsContext) ? VISIBLE : "sr-only";
}
