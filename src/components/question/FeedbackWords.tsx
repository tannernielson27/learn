"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the renderers print "Correct", "Incorrect" and "Missed" on screen beside their icons.
 * Off by default: the words are always in each element's accessible name, and the live and play
 * views keep them there so their layout and screenshots do not change. The take-home results page
 * (#210) turns them on, because there a student reviews every mark and colour must never be the
 * only signal.
 */
const FeedbackWordsContext = createContext(false);

/** Wrap a review to print the feedback words on screen. */
export function ShowFeedbackWords({ children }: { children: ReactNode }) {
  return <FeedbackWordsContext value={true}>{children}</FeedbackWordsContext>;
}

const VISIBLE = "ml-2 shrink-0 text-sm font-medium text-ink-1";

/** The class for a renderer's feedback word: visible inside ShowFeedbackWords, else sr-only. */
export function useFeedbackWordClass(): string {
  return useContext(FeedbackWordsContext) ? VISIBLE : "sr-only";
}
