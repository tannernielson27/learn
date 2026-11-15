// Pinned to UTC so a date renders the same on the server and in any browser.
const EDITED_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function formatEdited(iso: string): string {
  return `Edited ${EDITED_DATE.format(new Date(iso))}`;
}

export function itemCountLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

/**
 * A label in sentence case, for a small app label (docs/04 §11, 2026-11-14): "Matrix Multiple
 * Choice" reads "Matrix multiple choice". Only for labels with no proper noun or acronym in them.
 */
export function sentenceCase(label: string): string {
  if (label === "") return label;
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}
