import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderEmailBody } from "../layout";
import { passwordResetEmail, renderPasswordResetTemplate } from "./passwordReset";

const TEMPLATE_PATH = path.resolve(
  import.meta.dirname,
  "../../../../supabase/templates/recovery.html",
);

describe("the Supabase reset-password template", () => {
  const template = renderPasswordResetTemplate();

  it("is the committed supabase/templates/recovery.html, byte for byte", async () => {
    await expect(template).toMatchFileSnapshot(TEMPLATE_PATH);
  });

  it("carries no token and no Supabase verify link, only the site's sign-in page", () => {
    // The app never asks Supabase for a recovery email; anyone holding the publishable key can.
    // So the email must not reset anything: it only points at the sign-in page.
    const actions = new Set(template.match(/\{\{[^}]*\}\}/g));
    expect([...actions]).toEqual(["{{ .SiteURL }}"]);
    expect(template).toContain('href="{{ .SiteURL }}/sign-in"');
    expect(template).not.toMatch(/ConfirmationURL|TokenHash|\.Token\b|supabase\.co/);
  });

  it("follows the email rules: lang, presentation tables, nothing remote", () => {
    expect(template).toContain('<html lang="en">');
    expect(template).toContain("<title>Reset your LeaRN password</title>");
    expect(template).not.toContain("http://");
    expect(template).not.toMatch(/<img|\ssrc=|<link|<style|<script|<!--/i);
  });
});

describe("passwordResetEmail", () => {
  it("renders a real sign-in link, escaped, for the preview", () => {
    const body = renderEmailBody(passwordResetEmail("https://learn.example/sign-in"));
    expect(body).toContain('href="https://learn.example/sign-in"');
    expect(body).not.toContain("{{");
  });
});
