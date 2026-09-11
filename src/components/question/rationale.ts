import type { ScoreResult } from "@/lib/ngn/types";
import { blankOrder, type SentenceToken } from "./dropdown/DropdownSentence";

/**
 * Score-panel note for rationale items (drop-down and drag-and-drop): a dyad needs both blanks,
 * and a triad hinges on its anchor.
 */
export function explainRationale(
  tokens: readonly SentenceToken[],
  anchorBlankId: string | undefined,
  result: ScoreResult,
): string {
  const order = blankOrder(tokens);
  if (order.length !== 3) return "Dyad: the point is earned only when both blanks are correct.";
  // Mirrors the engine: without an explicit anchor, the first blank anchors the triad.
  const anchorId = anchorBlankId ?? order[0];
  const anchorCorrect = result.breakdown.find((b) => b.elementId === anchorId)?.correct ?? false;
  const lead = `Triad: Blank ${order.indexOf(anchorId) + 1} is the anchor.`;
  return anchorCorrect
    ? `${lead} It was correct, so each correct supporting blank earns a point.`
    : `${lead} It was incorrect, so the supporting blanks earn nothing.`;
}
