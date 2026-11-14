/**
 * The look every text field shares: Join code, sign in, sign up. States switch instantly (motion is
 * transform and opacity only, so a border colour never animates), and the border stays 1px in every
 * state so nothing shifts. Focus keeps the global 2px accent outline and turns the border accent too.
 *
 * - rest: `--line-field`, at least 3:1 against the field and the page in both themes
 * - hover: `--ink-2`, only while enabled, valid and not focused
 * - focus-visible: `--accent` border plus the global outline
 * - invalid (`aria-invalid`): the strong ink edge (`--field-invalid`), drawn 2px with an inset ring
 *   so the box does not grow, and kept under hover and focus. Never `--incorrect`: red only ever
 *   marks an answer (owner decision 2026-11-14). The words under the field say what is wrong.
 * - read-only (`readonly`): the second surface, so it reads as set rather than as broken
 * - disabled: dimmed, not-allowed cursor, no hover
 *
 * Padding and type size stay with each form (a Join code is mono and larger, a password field
 * leaves room for its Show button), so this carries no `px-*` or `text-*` size.
 */
export const FIELD_CLASSES =
  "tap-target w-full rounded-sm border border-line-field bg-surface-1 text-ink-1 " +
  "enabled:hover:not-focus-visible:not-aria-invalid:border-ink-2 " +
  "focus-visible:not-aria-invalid:border-accent " +
  "aria-invalid:border-field-invalid aria-invalid:inset-ring aria-invalid:inset-ring-field-invalid " +
  "[&[readonly]]:bg-surface-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** `FIELD_CLASSES` plus a form's own padding and type classes. */
export function fieldClasses(extra = ""): string {
  return extra ? `${FIELD_CLASSES} ${extra}` : FIELD_CLASSES;
}
