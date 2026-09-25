import { describe, expect, it } from "vitest";
import {
  EMAIL_FONT_STACK,
  escapeHtml,
  renderEmailBody,
  renderEmailDocument,
  trustedHtml,
  type EmailLayout,
} from "./layout";

const EMOJI = /\p{Extended_Pictographic}/u;

const layout: EmailLayout = {
  title: "Week 5 is open",
  heading: "Week 5 is open in LeaRN.",
  paragraphs: ["It is due Thursday at 17:00 MDT."],
  action: { label: "Open the assignment", href: "https://learn.example/learn/assignments/a" },
  notes: ["A note under the button."],
  footer: "Sent by LeaRN.",
};

describe("escapeHtml", () => {
  it("escapes the five characters that can end an element or an attribute", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("renderEmailDocument", () => {
  const html = renderEmailDocument(layout);

  it("is a whole document with a language, a title and a light-only color scheme", () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="en">/);
    expect(html).toContain("<title>Week 5 is open</title>");
    expect(html).toContain('<meta name="color-scheme" content="light only" />');
    expect(html).toContain('<meta charset="utf-8" />');
  });

  it("lays out with presentation tables and inline styles only", () => {
    const tables = html.match(/<table\b[^>]*>/g) ?? [];
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const table of tables) expect(table).toContain('role="presentation"');
    expect(html).not.toMatch(/<style|<script|<link|class=|@import|url\(/i);
  });

  it("loads nothing remote: no images, fonts, pixels or plain-http links", () => {
    expect(html).not.toMatch(/<img|\ssrc=|srcset=|background=/i);
    expect(html).not.toContain("http://");
    expect(html).not.toMatch(/Inter|fonts\.googleapis/);
    expect(html).toContain(`font-family: ${EMAIL_FONT_STACK}`);
    // The stack sits inside a double-quoted style attribute, so it may only use single quotes.
    expect(EMAIL_FONT_STACK).not.toContain('"');
  });

  it("has a button and the same link as visible text, for clients that drop the button", () => {
    const href = 'href="https://learn.example/learn/assignments/a"';
    expect(html.split(href).length - 1).toBe(2);
    expect(html).toContain(">Open the assignment</a>");
    expect(html).toContain(">https://learn.example/learn/assignments/a</a>");
    expect(html).toContain("Or copy this link into your browser:");
  });

  it("keeps the heading, paragraphs, notes and footer in order", () => {
    const order = [
      "Week 5 is open in LeaRN.",
      "It is due Thursday",
      "Open the assignment",
      "Or copy this link",
      "A note under the button.",
      "Sent by LeaRN.",
    ].map((part) => html.indexOf(part));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("<h1 ");
  });

  it("escapes every string it is given, the link included", () => {
    const hostile = renderEmailDocument({
      title: "<title>",
      heading: "<b>heading</b>",
      paragraphs: ['"para" & more'],
      action: { label: "<i>go</i>", href: 'https://x/"><script>alert(1)</script>' },
      notes: ["<u>note</u>"],
      footer: "<s>footer</s>",
    });
    expect(hostile).not.toMatch(/<(b|i|u|s|script)>/);
    expect(hostile).not.toContain("<title><title>");
    expect(hostile).toContain("&lt;b&gt;heading&lt;/b&gt;");
    expect(hostile).toContain("&quot;para&quot; &amp; more");
    expect(hostile).toContain('href="https://x/&quot;&gt;&lt;script&gt;');
  });

  it("passes trusted markup through as it is, and only when asked", () => {
    const html = renderEmailDocument({
      ...layout,
      action: {
        label: "Sign in",
        href: trustedHtml("{{ .RedirectTo }}&token_hash={{ .TokenHash }}"),
        text: trustedHtml("{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}"),
      },
    });
    expect(html).toContain('href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}"');
    expect(html).toContain(">{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}</a>");
  });

  it("carries no emoji", () => {
    expect(EMOJI.test(html)).toBe(false);
  });

  it("does not change the layout it was given", () => {
    const frozen = Object.freeze({
      ...layout,
      paragraphs: Object.freeze([...layout.paragraphs]),
    });
    expect(() => renderEmailDocument(frozen)).not.toThrow();
  });
});

describe("renderEmailBody", () => {
  it("is the document's body alone, for a preview inside a page", () => {
    const body = renderEmailBody(layout);
    expect(body).not.toMatch(/<html|<head|<body|<title|<!doctype/i);
    expect(body).toMatch(/^<table role="presentation"/);
    expect(renderEmailDocument(layout)).toContain(body);
  });
});
