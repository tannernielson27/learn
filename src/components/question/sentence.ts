/**
 * Plain helpers for the sentence items (drop-down and drag-and-drop cloze and rationale). They sit
 * apart from the components so the player can check a response is complete without loading a
 * renderer's chunk (#54).
 */

export type SentenceToken = { kind: "text"; value: string } | { kind: "blank"; blankId: string };

export interface BlankAnswer {
  blankId: string;
  choiceId: string;
}

/** Blank ids in reading order. */
export function blankOrder(tokens: readonly SentenceToken[]): string[] {
  return tokens.flatMap((t) => (t.kind === "blank" ? [t.blankId] : []));
}

/** A new answer list with one blank set or cleared, kept in reading order. */
export function withAnswer(
  tokens: readonly SentenceToken[],
  answers: readonly BlankAnswer[],
  blankId: string,
  choiceId: string | undefined,
): BlankAnswer[] {
  return blankOrder(tokens).flatMap((id) => {
    const value = id === blankId ? choiceId : answers.find((a) => a.blankId === id)?.choiceId;
    return value ? [{ blankId: id, choiceId: value }] : [];
  });
}

/** Whether every blank has an answer; shared by the drop-down and drag-and-drop sentences. */
export function allBlanksFilled(
  tokens: readonly SentenceToken[],
  answers: readonly { blankId: string }[],
): boolean {
  return blankOrder(tokens).every((id) => answers.some((a) => a.blankId === id));
}
