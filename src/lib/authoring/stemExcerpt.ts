/**
 * A question's text as one plain line: markdown marks dropped, a link or image reduced to its
 * words, and every run of white space one space. Pure, so a list, a report and a CSV all read a
 * stem the same way.
 */
export function plainStem(value: string): string {
  // A link or image shows its text alone; other parentheses are text, like a copy's "(copy)".
  return value
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/[*_`#>[\]!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain text cut to at most `max` characters, the last of them an ellipsis when anything was cut.
 * A single long word is cut mid-word rather than dropped, so the excerpt is never empty.
 */
export function shorten(plain: string, max: number): string {
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** A stored stem (`{ kind: "markdown", value }`) as a one-line excerpt; anything else reads as "". */
export function stemExcerpt(stem: unknown, max = 140): string {
  const value =
    stem && typeof stem === "object" && "value" in stem && typeof stem.value === "string"
      ? stem.value
      : "";
  return shorten(plainStem(value), max);
}
