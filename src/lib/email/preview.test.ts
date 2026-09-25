import { describe, expect, it } from "vitest";
import { EMAIL_PREVIEWS } from "./preview";

describe("the email preview samples", () => {
  it("covers every message LeaRN sends: the magic link and both reminders", () => {
    expect(EMAIL_PREVIEWS.map((preview) => preview.id)).toEqual([
      "magic-link",
      "reminder-opened",
      "reminder-closing-soon",
    ]);
  });

  it("renders each body with sample data, escaped, and no Supabase placeholder left", () => {
    for (const preview of EMAIL_PREVIEWS) {
      expect(preview.bodyHtml).toMatch(/^<table role="presentation"/);
      expect(preview.bodyHtml).not.toContain("{{");
      expect(preview.bodyHtml).not.toContain("http://");
      expect(preview.bodyHtml).not.toMatch(/<html|<body|<script/i);
    }
    const opened = EMAIL_PREVIEWS[1]!;
    // The sample title carries an ampersand, so the preview shows the escaping at work.
    expect(opened.bodyHtml).toContain("Heart failure &amp; fluid balance");
    expect(opened.bodyHtml).toContain("For NURS 301 Adult Health.");
  });

  it("gives each app-sent message its plain-text part, and says the magic link has none", () => {
    const [magic, opened, closing] = EMAIL_PREVIEWS;
    expect(magic!.text).toBeNull();
    expect(opened!.text).toContain("Heart failure & fluid balance is open in LeaRN.");
    expect(opened!.text).toContain("https://learn.example/learn/assignments/");
    expect(closing!.text).toContain("closes tomorrow at 17:00 MDT");
    expect(closing!.subject).toBe("Week 5: Heart failure & fluid balance closes tomorrow at 17:00");
  });
});
