/**
 * The one heading style for the sections of the teacher's live console (#563, docs/04 §11): the
 * app's sans at body size and semibold, in the main ink. Results, Questions, Not answered yet, In
 * this session, Progress and Join code all wear it, so no section reads louder than another. The
 * serif stays for the session's title and its end ("This live session has ended."), and the
 * projector keeps its own type (§11 "Unchanged").
 */
export const CONSOLE_HEADING_CLASSES = "text-base font-semibold text-ink-1";

/**
 * A small label in the console, such as where the room is ("Question 2 of 3 · Answer showing"):
 * sentence case, not the public site's all-caps eyebrow (docs/04 §11, owner decision 2026-11-14).
 */
export const CONSOLE_LABEL_CLASSES = "text-sm font-medium text-ink-2";
