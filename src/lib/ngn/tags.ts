/**
 * Item tags (docs/01-NGN-ITEM-SPEC.md §4.4 `tags[]`): the fixed NCLEX-RN client needs categories
 * and free topic tags share one list. A client needs category is always stored in its fixed
 * spelling; a topic is stored lower-case, so "Sepsis" and "sepsis" are one filter. Pure.
 */

/** Bounds on an item's tags, client needs categories included. */
export const TAG_LIMITS = { count: 20, length: 50 } as const;

/** The eight NCLEX-RN client needs subcategories, in test plan order. */
export const CLIENT_NEEDS = [
  "Management of Care",
  "Safety and Infection Control",
  "Health Promotion and Maintenance",
  "Psychosocial Integrity",
  "Basic Care and Comfort",
  "Pharmacological and Parenteral Therapies",
  "Reduction of Risk Potential",
  "Physiological Adaptation",
] as const;
export type ClientNeed = (typeof CLIENT_NEEDS)[number];

const CLIENT_NEED_BY_KEY = new Map<string, ClientNeed>(
  CLIENT_NEEDS.map((need) => [need.toLowerCase(), need]),
);

export function isClientNeed(tag: string): tag is ClientNeed {
  return (CLIENT_NEEDS as readonly string[]).includes(tag);
}

/** One tag trimmed with its whitespace closed up; a client need in its fixed spelling, else lower-case. */
export function normalizeTag(raw: string): string {
  const key = raw.replace(/\s+/g, " ").trim().toLowerCase();
  return CLIENT_NEED_BY_KEY.get(key) ?? key;
}

/** Tags normalized, without blanks or repeats, in the order first given. */
export function normalizeTags(raw: readonly string[]): string[] {
  const tags = raw.map(normalizeTag).filter((tag) => tag !== "");
  return [...new Set(tags)];
}

/** Client needs in the fixed list's order, and topics in their own order. */
export function splitTags(tags: readonly string[]): {
  clientNeeds: ClientNeed[];
  topics: string[];
} {
  return {
    clientNeeds: CLIENT_NEEDS.filter((need) => tags.includes(need)),
    topics: tags.filter((tag) => !isClientNeed(tag)),
  };
}

/** Why normalized tags break the limits, or null when they fit. */
export function tagLimitProblem(tags: readonly string[]): string | null {
  if (tags.length > TAG_LIMITS.count) return `An item can have at most ${TAG_LIMITS.count} tags.`;
  if (tags.some((tag) => tag.length > TAG_LIMITS.length)) {
    return `Keep each tag to ${TAG_LIMITS.length} characters or fewer.`;
  }
  return null;
}
