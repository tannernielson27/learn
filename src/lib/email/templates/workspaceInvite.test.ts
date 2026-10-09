import { describe, expect, it } from "vitest";
import { renderEmailBody } from "../layout";
import {
  WORKSPACE_INVITE_SUBJECT,
  renderWorkspaceInviteEmail,
  workspaceInviteEmail,
  type WorkspaceInviteContent,
} from "./workspaceInvite";

const LINK = "https://learn.example/w/sample-invite-token-0123456789ab";

const CONTENT: WorkspaceInviteContent = {
  workspaceName: "Adult Health & Pharm",
  inviterEmail: "ada@school.edu",
  link: LINK,
};

// What a person could type as a workspace name or hold as an address, carrying every character
// HTML gives a meaning to.
const HOSTILE: WorkspaceInviteContent = {
  workspaceName: `<img src=x onerror="alert('w')">`,
  inviterEmail: `"><script>alert(1)</script>@evil.example`,
  link: `https://learn.example/w/a"><script>alert('x')</script>`,
};

describe("the workspace invitation email", () => {
  it("renders an HTML and a plain-text part with the same link", () => {
    const email = renderWorkspaceInviteEmail(CONTENT);
    expect(email.subject).toBe(WORKSPACE_INVITE_SUBJECT);
    expect(email.html).toMatch(/^<!doctype html>/);
    expect(email.html).toContain(`<title>${WORKSPACE_INVITE_SUBJECT}</title>`);
    expect(email.html).toContain(">Accept the invitation</a>");
    expect(email.text).not.toMatch(/<[a-z!/]/i);
    expect(email.text).toContain(`Accept the invitation: ${LINK}`);
  });

  it("says who invited and into which workspace", () => {
    const { html, text } = renderWorkspaceInviteEmail(CONTENT);
    expect(text).toContain("ada@school.edu invited you");
    expect(text).toContain('"Adult Health & Pharm"');
    expect(html).toContain("ada@school.edu invited you");
    expect(html).toContain("&quot;Adult Health &amp; Pharm&quot;");
  });

  it("keeps the workspace name and the inviter out of the subject line", () => {
    const { subject } = renderWorkspaceInviteEmail(HOSTILE);
    expect(subject).toBe(WORKSPACE_INVITE_SUBJECT);
    expect(WORKSPACE_INVITE_SUBJECT).not.toMatch(/Adult|ada@|school/);
    // Nor in the document title, which some clients show as the preview.
    expect(renderWorkspaceInviteEmail(CONTENT).html).not.toMatch(/<title>[^<]*Adult/);
  });

  it("escapes the workspace name, the inviter's address and the link in the HTML part", () => {
    const { html } = renderWorkspaceInviteEmail(HOSTILE);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/onerror="/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(&#39;w&#39;)&quot;&gt;");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;@evil.example");
    expect(html).toContain(
      'href="https://learn.example/w/a&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"',
    );
  });

  it("puts a name or an address on one line, and clips a long one", () => {
    const { text } = renderWorkspaceInviteEmail({
      ...CONTENT,
      workspaceName: `  Ward\r\n\r\nGo to https://evil.example now\t${"x".repeat(200)}  `,
      inviterEmail: "ada@school.edu\nBcc: everyone@school.edu",
    });
    expect(text).toContain("ada@school.edu Bcc: everyone@school.edu invited you");
    expect(text).toContain('"Ward Go to https://evil.example now x');
    expect(text).not.toMatch(/Ward\r?\n/);
    expect(text).not.toContain("x".repeat(121));
    expect(text).toContain("...");
  });

  it("carries no free-text message: nothing but the name and the address is the inviter's", () => {
    const first = renderWorkspaceInviteEmail(CONTENT).text;
    const second = renderWorkspaceInviteEmail({
      workspaceName: "W",
      inviterEmail: "b@b.example",
      link: LINK,
    }).text;
    const strip = (text: string, c: { workspaceName: string; inviterEmail: string }) =>
      text.replace(c.workspaceName, "").replace(c.inviterEmail, "");
    expect(strip(first, CONTENT)).toBe(
      strip(second, { workspaceName: "W", inviterEmail: "b@b.example" }),
    );
  });

  it("says what accepting does, who can, and that ignoring it is safe", () => {
    const { text } = renderWorkspaceInviteEmail(CONTENT);
    expect(text).toMatch(/^You are invited to a LeaRN workspace\n/);
    expect(text).toMatch(/instructor/);
    expect(text).toMatch(/only for this email address/);
    expect(text).toMatch(/7 days/);
    expect(text).toMatch(/ignore this email/);
  });

  it("refuses a link that is not a web address rather than mailing it", () => {
    expect(() => renderWorkspaceInviteEmail({ ...CONTENT, link: "javascript:alert(1)" })).toThrow(
      /https:\/\//,
    );
  });

  it("follows the email rules: no emoji, nothing remote, no placeholder", () => {
    const { html, text } = renderWorkspaceInviteEmail(CONTENT);
    expect(html).not.toMatch(/<img|\ssrc=|<link|<style|<script|<!--/i);
    expect(html).not.toContain("{{");
    expect(`${html}${text}`).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("gives the layout to a preview, which renders the same body", () => {
    const body = renderEmailBody(workspaceInviteEmail(CONTENT));
    expect(renderWorkspaceInviteEmail(CONTENT).html).toContain(body);
  });

  it("gives e2e/mailbox.ts the whole link", () => {
    const { html } = renderWorkspaceInviteEmail(CONTENT);
    expect(html.match(/https?:\/\/[^\s"'<>]+\/w\/[^\s"'<>]+/)?.[0]).toBe(LINK);
  });
});
