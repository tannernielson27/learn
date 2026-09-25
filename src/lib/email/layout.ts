/**
 * The one LeaRN email layout (#268): every message LeaRN sends is built here, the Supabase
 * magic-link template included (`./templates/magicLink.ts` writes `supabase/templates/magic_link.html`).
 *
 * Mail clients are not browsers, so the rules are strict:
 * - tables for layout, each `role="presentation"` so a screen reader does not announce a grid;
 * - inline styles only: no `<style>`, no classes, no scripts;
 * - system fonts only, and nothing remote at all: no images, web fonts or tracking pixels;
 * - light only, with hex approximations of the docs/04 tokens (clients do not understand oklch);
 * - a visible copy of the link under the button, for clients that strip or block buttons;
 * - no emoji, no comments (they would ship in every email).
 *
 * Every string is HTML-escaped. The one way around that is `trustedHtml`, which exists for the
 * Supabase template's `{{ ... }}` placeholders and must never wrap anything a person typed.
 *
 * Pure: no Next, no Supabase, no environment, and no import from the mailer, so a preview page can
 * use it without pulling the Resend key's module into anything.
 */

/**
 * Markup passed through unescaped. Only for placeholders written in this repo. A class with a
 * private field, so the type is nominal: a plain `{ trustedHtml: someString }` does not type-check
 * as one, and the only way to make one is to call `trustedHtml()` where a reviewer can see it.
 */
export class TrustedHtml {
  readonly #brand = true;
  constructor(readonly trustedHtml: string) {}
  /** Keeps the private brand from being reported as unused. */
  get isTrusted(): boolean {
    return this.#brand;
  }
}

export function trustedHtml(markup: string): TrustedHtml {
  return new TrustedHtml(markup);
}

export type EmailText = string | TrustedHtml;

export interface EmailAction {
  readonly label: string;
  readonly href: EmailText;
  /** The link as visible text under the button. Defaults to `href`. */
  readonly text?: EmailText;
}

export interface EmailLayout {
  /** The document title; also what some clients show as the preview heading. */
  readonly title: string;
  readonly heading: EmailText;
  /** Above the button. */
  readonly paragraphs: readonly EmailText[];
  readonly action: EmailAction;
  /** Smaller print under the button and the visible link. */
  readonly notes?: readonly EmailText[];
  /** Under the card: why this person got the email. */
  readonly footer: string;
}

/** System fonts only. Single quotes, because it sits inside a double-quoted style attribute. */
export const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Hex approximations of the docs/04 tokens. Each text color passes WCAG AA on its background. */
export const EMAIL_COLORS = {
  page: "#faf9f6",
  card: "#ffffff",
  line: "#dddad4",
  ink: "#1b1d22",
  muted: "#5b5e66",
  accent: "#1f5596",
  onAccent: "#ffffff",
} as const;

const FONT = `font-family: ${EMAIL_FONT_STACK}`;
const C = EMAIL_COLORS;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markup(value: EmailText): string {
  // String() so that anything else that reaches here at runtime is escaped rather than trusted.
  return value instanceof TrustedHtml ? value.trustedHtml : escapeHtml(String(value));
}

/**
 * The link, escaped for an attribute. A plain string must be a web address: a `javascript:` or
 * `data:` link in a mail is never something LeaRN meant to send, so it throws instead.
 */
function hrefOf(action: EmailAction): string {
  if (action.href instanceof TrustedHtml) return action.href.trustedHtml;
  if (!/^https?:\/\//i.test(action.href)) {
    throw new Error("An email link must start with https:// or http://.");
  }
  return escapeHtml(action.href);
}

function button(action: EmailAction): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    `<td style="border-radius: 6px; background-color: ${C.accent}">`,
    `<a href="${hrefOf(action)}" style="display: inline-block; padding: 12px 24px; ${FONT}; font-size: 16px; font-weight: 700; color: ${C.onAccent}; text-decoration: none; border-radius: 6px">${escapeHtml(action.label)}</a>`,
    "</td></tr></table>",
  ].join("\n");
}

function visibleLink(action: EmailAction): string {
  return (
    `<p style="margin: 24px 0 0; font-size: 14px; color: ${C.muted}">Or copy this link into your browser:<br />` +
    `<a href="${hrefOf(action)}" style="color: ${C.accent}; text-decoration: underline; word-break: break-all">${markup(action.text ?? action.href)}</a></p>`
  );
}

/** The layout table alone, without `<html>` or `<body>`: what a preview page renders. */
export function renderEmailBody(layout: EmailLayout): string {
  const paragraphs = layout.paragraphs.map(
    (line) => `<p style="margin: 0 0 24px">${markup(line)}</p>`,
  );
  const notes = (layout.notes ?? []).map(
    (note) => `<p style="margin: 16px 0 0; font-size: 14px; color: ${C.muted}">${markup(note)}</p>`,
  );
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${C.page}">`,
    '<tr><td align="center" style="padding: 32px 16px">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px; background-color: ${C.card}; border: 1px solid ${C.line}; border-radius: 8px">`,
    `<tr><td style="padding: 32px 28px; ${FONT}; color: ${C.ink}; font-size: 16px; line-height: 1.5">`,
    `<p style="margin: 0 0 24px; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; color: ${C.accent}">LeaRN</p>`,
    `<h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.3; font-weight: 700; color: ${C.ink}">${markup(layout.heading)}</h1>`,
    ...paragraphs,
    button(layout.action),
    visibleLink(layout.action),
    ...notes,
    "</td></tr>",
    "</table>",
    `<p style="margin: 16px 0 0; max-width: 480px; ${FONT}; font-size: 12px; line-height: 1.5; color: ${C.muted}">${escapeHtml(layout.footer)}</p>`,
    "</td></tr>",
    "</table>",
  ].join("\n");
}

/** The whole email document. */
export function renderEmailDocument(layout: EmailLayout): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="color-scheme" content="light only" />',
    `<title>${escapeHtml(layout.title)}</title>`,
    "</head>",
    `<body style="margin: 0; padding: 0; background-color: ${C.page}">`,
    renderEmailBody(layout),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
