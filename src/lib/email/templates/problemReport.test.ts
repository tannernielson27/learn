import { describe, expect, it } from "vitest";
import { validateMessage } from "../message";
import { renderEmailBody } from "../layout";
import {
  problemReportEmail,
  problemReportSubject,
  renderProblemReportEmail,
  type ProblemReportDetails,
} from "./problemReport";

const DETAILS: ProblemReportDetails = {
  message: "The live session froze on question 3.\nI pressed Next twice and nothing happened.",
  sender: { email: "teacher@example.com", displayName: "Pat Rivera", role: "teacher" },
  page: "/live/[redacted]",
  reference: "1234567890",
  eventId: "0123456789abcdef0123456789abcdef",
  version: "3ae4ba1c0ffe",
  environment: "production",
};

describe("the problem report email", () => {
  it("leads the subject with the first line, untagged on production", () => {
    expect(problemReportSubject(DETAILS)).toBe("Problem: The live session froze on question 3.");
  });

  it("tags staging and local mail, so tests stand out in support@", () => {
    expect(problemReportSubject({ ...DETAILS, environment: "preview" })).toMatch(/^\[staging\] /);
    expect(problemReportSubject({ ...DETAILS, environment: "development" })).toMatch(
      /^\[development\] /,
    );
  });

  it("keeps the subject to one short line the mailer accepts", () => {
    const subject = problemReportSubject({
      ...DETAILS,
      message: `${"word ".repeat(40)}\r\nBcc: someone@example.com`,
    });
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual("Problem: ".length + 60);
    expect(subject.endsWith("…")).toBe(true);
  });

  it("carries the message and everything support needs to find the problem", () => {
    const { text, html } = renderProblemReportEmail(DETAILS);
    for (const part of [text, html]) {
      expect(part).toContain("The live session froze on question 3.");
      expect(part).toContain("I pressed Next twice and nothing happened.");
      expect(part).toContain("teacher@example.com");
      expect(part).toContain("Pat Rivera");
      expect(part).toContain("/live/[redacted]");
      expect(part).toContain("1234567890");
      expect(part).toContain("0123456789abcdef0123456789abcdef");
      expect(part).toContain("3ae4ba1c0ffe");
    }
    expect(text).not.toMatch(/<[a-z!/]/i);
  });

  it("says plainly when there was no error screen or account name", () => {
    const { text } = renderProblemReportEmail({
      ...DETAILS,
      reference: null,
      eventId: null,
      sender: { email: "student@example.com", displayName: null, role: null },
    });
    expect(text).toContain("From: student@example.com");
    expect(text).toContain("Role: none yet");
    expect(text).toContain("Reference: none");
    expect(text).toContain("Sentry event: none");
  });

  it("escapes what the person typed", () => {
    const { html } = renderProblemReportEmail({
      ...DETAILS,
      message: `<script>alert("x")</script> & <img src=x onerror=alert(1)>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img");
  });

  it("has no button, since there is nothing to press", () => {
    expect(problemReportEmail(DETAILS).action).toBeUndefined();
    expect(renderProblemReportEmail(DETAILS).html).not.toContain("<a ");
  });

  it("passes the mailer's own checks", () => {
    const { subject, text, html } = renderProblemReportEmail(DETAILS);
    expect(() =>
      validateMessage({
        to: "support@learnursing.app",
        replyTo: DETAILS.sender.email,
        subject,
        text,
        html,
        idempotencyKey: "problem-report:user-1:abc",
      }),
    ).not.toThrow();
  });

  it("gives the layout to a preview, which renders the same body", () => {
    const body = renderEmailBody(problemReportEmail(DETAILS));
    expect(renderProblemReportEmail(DETAILS).html).toContain(body);
  });
});
