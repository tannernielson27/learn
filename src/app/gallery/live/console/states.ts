/** The states `/gallery/live/console?state=` draws. A plain module: the page reads it on the server. */
export const CONSOLE_STATES = [
  "lobby",
  "question",
  "question-untimed",
  "reconnecting",
  "offline",
  "ended",
] as const;
export type ConsoleState = (typeof CONSOLE_STATES)[number];
