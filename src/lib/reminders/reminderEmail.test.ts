import { describe, expect, it } from "vitest";
import { validateMessage } from "@/lib/email/message";
import { assignmentLink, formatDueTime, renderReminderEmail } from "./reminderEmail";

// 2026-09-24 17:00 in Denver (MDT, UTC-6) is 23:00 UTC.
const CLOSES = "2026-09-24T23:00:00Z";
const DAY_BEFORE = new Date("2026-09-23T23:00:00Z");
const LINK = "https://learn.example/learn/assignments/00000000-0000-4000-8000-0000000212b1";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("formatDueTime", () => {
  it("says the time in the class's zone on a 24-hour clock, with the zone's short name", () => {
    expect(formatDueTime(CLOSES, "America/Denver", DAY_BEFORE)).toEqual({
      day: "tomorrow",
      date: "Thursday, September 24",
      time: "17:00",
      zone: "MDT",
    });
  });

  it("says today, tomorrow, or the weekday by the calendar in that zone, not by hours", () => {
    const lateEvening = new Date("2026-09-24T05:30:00Z"); // 23:30 on the 23rd in Denver
    expect(formatDueTime(CLOSES, "America/Denver", lateEvening).day).toBe("tomorrow");
    const sameMorning = new Date("2026-09-24T14:00:00Z"); // 08:00 on the 24th in Denver
    expect(formatDueTime(CLOSES, "America/Denver", sameMorning).day).toBe("today");
    const twoDaysOut = new Date("2026-09-22T15:00:00Z");
    expect(formatDueTime(CLOSES, "America/Denver", twoDaysOut).day).toBe("on Thursday");
  });

  it("uses another zone when the class has one", () => {
    expect(formatDueTime(CLOSES, "Europe/London", DAY_BEFORE)).toMatchObject({
      time: "00:00",
      date: "Friday, September 25",
    });
  });

  it("falls back to UTC for a zone this runtime does not know rather than failing the send", () => {
    expect(formatDueTime(CLOSES, "Not/AZone", DAY_BEFORE)).toMatchObject({
      time: "23:00",
      zone: "UTC",
    });
  });
});

describe("assignmentLink", () => {
  it("is the student's assignment page on the given origin", () => {
    expect(assignmentLink("https://learn.example", "00000000-0000-4000-8000-0000000212b1")).toBe(
      LINK,
    );
  });

  it("drops a trailing slash on the origin", () => {
    expect(assignmentLink("https://learn.example/", "abc")).toBe(
      "https://learn.example/learn/assignments/abc",
    );
  });
});

describe("renderReminderEmail", () => {
  const base = {
    title: "Week 5",
    closesAt: CLOSES,
    timeZone: "America/Denver",
    link: LINK,
    now: DAY_BEFORE,
  };

  it("announces an opened assignment with its due time and link", () => {
    const email = renderReminderEmail({ ...base, kind: "opened" });
    expect(email.subject).toBe("Week 5 is open");
    expect(email.text).toContain("Week 5 is open in LeaRN.");
    expect(email.text).toContain("It is due Thursday, September 24 at 17:00 MDT.");
    expect(email.text).toContain(LINK);
    expect(email.html).toContain(`href="${LINK}"`);
    expect(email.html).toContain("Thursday, September 24 at 17:00 MDT");
  });

  it("warns a day before close, in the demo's words", () => {
    const email = renderReminderEmail({ ...base, kind: "closing_soon" });
    expect(email.subject).toBe("Week 5 closes tomorrow at 17:00");
    expect(email.text).toContain("Week 5 closes tomorrow at 17:00 MDT");
    expect(email.text).toContain("not submitted");
    expect(email.text).toContain(LINK);
  });

  it("escapes the title in the HTML and keeps the subject on one line", () => {
    const email = renderReminderEmail({
      ...base,
      kind: "opened",
      title: 'Week <5> & "friends"\r\nBcc: someone',
    });
    expect(email.html).not.toContain("<5>");
    expect(email.html).toContain("Week &lt;5&gt; &amp; &quot;friends&quot;");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toBe('Week <5> & "friends" Bcc: someone is open');
  });

  it("shortens a long title in the subject so the subject stays valid", () => {
    const email = renderReminderEmail({ ...base, kind: "closing_soon", title: "x".repeat(200) });
    expect(email.subject.length).toBeLessThanOrEqual(200);
    expect(() =>
      validateMessage({ ...email, to: "student@example.com", idempotencyKey: "reminder:a:b:c" }),
    ).not.toThrow();
  });

  it("follows the magic-link template's rules: inline styles, light only, no emoji, no scripts", () => {
    for (const kind of ["opened", "closing_soon"] as const) {
      const email = renderReminderEmail({ ...base, kind });
      expect(email.html).toMatch(/^<!doctype html>/);
      expect(email.html).toContain('<meta name="color-scheme" content="light only" />');
      expect(email.html).not.toMatch(/<style|<script|class=/i);
      expect(email.html).toContain("background-color: #1f5596");
      expect(EMOJI.test(email.html)).toBe(false);
      expect(EMOJI.test(email.text)).toBe(false);
      expect(EMOJI.test(email.subject)).toBe(false);
    }
  });

  it("escapes the link too", () => {
    const email = renderReminderEmail({ ...base, kind: "opened", link: 'https://x/"><b>' });
    expect(email.html).not.toContain('"><b>');
  });
});
