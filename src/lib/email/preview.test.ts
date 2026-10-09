import { describe, expect, it } from "vitest";
import { EMAIL_PREVIEWS } from "./preview";

function preview(id: (typeof EMAIL_PREVIEWS)[number]["id"]) {
  const found = EMAIL_PREVIEWS.find((candidate) => candidate.id === id);
  expect(found).toBeDefined();
  return found!;
}

describe("the email preview samples", () => {
  it("covers every message LeaRN sends: the magic link, welcomes, invitation and reminders", () => {
    expect(EMAIL_PREVIEWS.map((p) => p.id)).toEqual([
      "magic-link",
      "welcome-student",
      "welcome-teacher",
      "workspace-invite",
      "reminder-opened",
      "reminder-closing-soon",
    ]);
  });

  it("renders each body with sample data, escaped, and no Supabase placeholder left", () => {
    for (const p of EMAIL_PREVIEWS) {
      expect(p.bodyHtml).toMatch(/^<table role="presentation"/);
      expect(p.bodyHtml).not.toContain("{{");
      expect(p.bodyHtml).not.toContain("http://");
      expect(p.bodyHtml).not.toMatch(/<html|<body|<script/i);
    }
    const opened = preview("reminder-opened");
    // The sample title carries an ampersand, so the preview shows the escaping at work.
    expect(opened.bodyHtml).toContain("Heart failure &amp; fluid balance");
    expect(opened.bodyHtml).toContain("For NURS 301 Adult Health.");
  });

  it("gives each app-sent message its plain-text part, and says the magic link has none", () => {
    expect(preview("magic-link").text).toBeNull();
    const opened = preview("reminder-opened");
    const closing = preview("reminder-closing-soon");
    expect(opened.text).toContain("Heart failure & fluid balance is open in LeaRN.");
    expect(opened.text).toContain("https://learn.example/learn/assignments/");
    expect(closing.text).toContain("closes tomorrow at 17:00 MDT");
    expect(closing.subject).toBe("Week 5: Heart failure & fluid balance closes tomorrow at 17:00");
  });

  it("shows the welcome email for each role, landing where that role starts", () => {
    const student = preview("welcome-student");
    const teacher = preview("welcome-teacher");
    expect(student.subject).toBe("Welcome to LeaRN: confirm your email address");
    expect(student.text).toContain(
      "https://learn.example/auth/confirm?next=%2Flearn&token_hash=sample-token-hash&type=email",
    );
    expect(teacher.text).toContain("next=%2Fauthor&");
    expect(student.bodyHtml).toContain("Confirm my email address");
    expect(teacher.bodyHtml).toContain("make a class");
  });

  it("shows the workspace invitation, with its sample name escaped and out of the subject", () => {
    const invite = preview("workspace-invite");
    expect(invite.name).toBe("Workspace invitation");
    expect(invite.subject).toBe("You are invited to teach in a LeaRN workspace");
    expect(invite.bodyHtml).toContain("Accept the invitation");
    expect(invite.bodyHtml).toContain("&quot;Adult Health &amp; &quot;Pharm&quot; team&quot;");
    expect(invite.text).toContain(`"Adult Health & "Pharm" team"`);
    expect(invite.text).toContain("ada.instructor@learn.example invited you");
    expect(invite.text).toContain("https://learn.example/w/sample-invite-token-0123456789ab");
  });
});
