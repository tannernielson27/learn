import { describe, expect, it } from "vitest";
import { renderEmailBody } from "../layout";
import { WELCOME_SUBJECT, renderWelcomeEmail, welcomeEmail, type WelcomeRole } from "./welcome";

const LINK =
  "https://learn.example/auth/confirm?next=%2Flearn&token_hash=sample-token-hash&type=email";

// A link no real token produces, carrying every character HTML gives a meaning to.
const HOSTILE_LINK = `https://learn.example/auth/confirm?next=%2Flearn&token_hash=a"><script>alert('x')</script>&type=email`;

const ROLES: readonly WelcomeRole[] = ["student", "teacher", "newcomer"];

describe("the welcome email", () => {
  it.each(ROLES)("renders the %s variant with an HTML and a plain-text part", (role) => {
    const email = renderWelcomeEmail(role, LINK);
    expect(email.subject).toBe(WELCOME_SUBJECT);
    expect(email.html).toMatch(/^<!doctype html>/);
    expect(email.html).toContain("<title>Welcome to LeaRN: confirm your email address</title>");
    expect(email.html).toContain(">Confirm my email address</a>");
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.text).not.toMatch(/<[a-z!/]/i);
    // The plain-text part carries the same link, whole, for a client that shows only text.
    expect(email.text).toContain(`Confirm my email address: ${LINK}`);
  });

  it("says welcome and confirm, never that someone used the sign-in page", () => {
    for (const role of ROLES) {
      const { html, text } = renderWelcomeEmail(role, LINK);
      expect(text).toMatch(/^Welcome to LeaRN\n/);
      expect(text).toMatch(/confirm/i);
      expect(html).not.toMatch(/sign-in page/i);
      expect(text).not.toMatch(/sign-in page/i);
    }
  });

  it("tells each role what to do first", () => {
    expect(renderWelcomeEmail("student", LINK).text).toMatch(/you are in your class/);
    expect(renderWelcomeEmail("student", LINK).text).toMatch(/Send the email again/);
    expect(renderWelcomeEmail("teacher", LINK).text).toMatch(/make a class/);
    expect(renderWelcomeEmail("teacher", LINK).text).not.toMatch(/you are in your class/);
    // #361: an account with no class yet is told how to join one, not that it is in one.
    expect(renderWelcomeEmail("newcomer", LINK).text).toMatch(/join your class/);
    expect(renderWelcomeEmail("newcomer", LINK).text).not.toMatch(/you are in your class/);
  });

  it("escapes the link in the HTML part, button and visible copy alike", () => {
    const { html } = renderWelcomeEmail("student", HOSTILE_LINK);
    expect(html).not.toContain("<script>");
    expect(html).toContain(
      'href="https://learn.example/auth/confirm?next=%2Flearn&amp;token_hash=a&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;type=email"',
    );
    expect(html).toContain(
      ">https://learn.example/auth/confirm?next=%2Flearn&amp;token_hash=a&quot;&gt;&lt;script&gt;",
    );
  });

  it("refuses a link that is not a web address rather than mailing it", () => {
    expect(() => renderWelcomeEmail("student", "javascript:alert(1)")).toThrow(/https:\/\//);
  });

  it("follows the email rules: no emoji, nothing remote, no placeholder", () => {
    for (const role of ROLES) {
      const { html, text } = renderWelcomeEmail(role, LINK);
      expect(html).not.toMatch(/<img|\ssrc=|<link|<style|<script|<!--/i);
      expect(html).not.toContain("{{");
      expect(`${html}${text}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("gives the layout to a preview, which renders the same body", () => {
    const body = renderEmailBody(welcomeEmail("teacher", LINK));
    expect(renderWelcomeEmail("teacher", LINK).html).toContain(body);
  });

  it("gives e2e/mailbox.ts the whole link, as the sign-in email does", () => {
    const { html } = renderWelcomeEmail("student", LINK);
    const found = html.match(/https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/)?.[0];
    expect(found?.replace(/&amp;/g, "&")).toBe(LINK);
  });
});
