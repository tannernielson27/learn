import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderEmailBody } from "../layout";
import { magicLinkEmail, renderMagicLinkTemplate } from "./magicLink";

const TEMPLATE_PATH = path.resolve(
  import.meta.dirname,
  "../../../../supabase/templates/magic_link.html",
);

// Written out, not imported: this is what the app and e2e/mailbox.ts depend on today (#206), and
// the test exists to notice a change to it. The token-hash link goes to /auth/confirm, so a link
// opened on another device than the one that asked still works.
const HREF_TODAY = "{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email";

describe("the Supabase magic-link template", () => {
  const template = renderMagicLinkTemplate();

  it("is the committed supabase/templates/magic_link.html, byte for byte", async () => {
    // The file is generated from this module so it cannot drift from the reminders' layout. After
    // a deliberate change, `pnpm vitest run src/lib/email/templates -u` rewrites it; then paste it
    // into both Supabase projects (docs/05 §7.7 step 3).
    await expect(template).toMatchFileSnapshot(TEMPLATE_PATH);
  });

  it("keeps the token-hash link exactly as the app uses it, on the button", () => {
    expect(template).toContain(`href="${HREF_TODAY}"`);
    // The same link as visible text, with the ampersands escaped as HTML text should be.
    expect(template).toContain(
      ">{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email</a>",
    );
  });

  it("uses no Supabase variable other than the two the link needs", () => {
    const actions = new Set(template.match(/\{\{[^}]*\}\}/g));
    expect([...actions].sort()).toEqual(["{{ .RedirectTo }}", "{{ .TokenHash }}"]);
  });

  it("gives e2e/mailbox.ts the whole link, as it did before", () => {
    const sent = readFileSync(TEMPLATE_PATH, "utf8")
      .replaceAll("{{ .RedirectTo }}", "http://127.0.0.1:3100/auth/confirm?next=%2Fauthor")
      .replaceAll("{{ .TokenHash }}", "pkce_abc123");
    // The same expression e2e/mailbox.ts runs on the HTML part.
    const found = sent.match(/https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/)?.[0];
    expect(found?.replace(/&amp;/g, "&")).toBe(
      "http://127.0.0.1:3100/auth/confirm?next=%2Fauthor&token_hash=pkce_abc123&type=email",
    );
  });

  it("follows the email rules: lang, presentation tables, nothing remote", () => {
    expect(template).toContain('<html lang="en">');
    expect(template).toContain("<title>Sign in to LeaRN</title>");
    expect(template).not.toContain("http://");
    expect(template).not.toMatch(/<img|\ssrc=|<link|<style|<script|<!--/i);
  });
});

describe("magicLinkEmail", () => {
  it("renders a real link, escaped, for the preview", () => {
    const body = renderEmailBody(
      magicLinkEmail("https://learn.example/auth/confirm?next=%2Fauthor&token_hash=abc&type=email"),
    );
    expect(body).toContain(
      'href="https://learn.example/auth/confirm?next=%2Fauthor&amp;token_hash=abc&amp;type=email"',
    );
    expect(body).not.toContain("{{");
  });
});
