/**
 * The two reminder emails (#212): "Week 5 is open" and "Week 5 closes tomorrow at 17:00".
 *
 * Short plain text plus a simple HTML version that follows the magic-link template's rules
 * (`supabase/templates/magic_link.html`): tables and inline styles only, light only, no emoji, no
 * scripts, no classes. The due time is in the class's time zone on a 24-hour clock with the zone's
 * short name, so "17:00 MDT" means the same thing to everyone reading it.
 *
 * Pure: no Next, no Supabase, no environment. `now` is a parameter so "today" and "tomorrow" can be
 * tested.
 */

export type ReminderKind = "opened" | "closing_soon";

export interface ReminderContent {
  kind: ReminderKind;
  title: string;
  /** ISO timestamp of the close. */
  closesAt: string;
  /** IANA zone of the class, e.g. America/Denver. */
  timeZone: string;
  /** The student's assignment page. */
  link: string;
  now: Date;
}

export interface RenderedReminder {
  subject: string;
  text: string;
  html: string;
}

export interface DueTime {
  /** "today", "tomorrow", or "on Thursday", by the calendar in the zone. */
  day: string;
  /** "Thursday, September 24". */
  date: string;
  /** "17:00". */
  time: string;
  /** "MDT". */
  zone: string;
}

const FALLBACK_ZONE = "UTC";
const SUBJECT_TITLE_MAX = 120;
const DAY_MS = 86_400_000;

function zoneOrFallback(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    // Postgres and this runtime's ICU disagree on a name now and then. A reminder in UTC beats
    // no reminder.
    return FALLBACK_ZONE;
  }
}

function partsIn(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Days from `now`'s calendar date to `when`'s, both read in the zone. */
function calendarDaysBetween(now: Date, when: Date, timeZone: string): number {
  // en-CA formats a date as YYYY-MM-DD, which Date.parse reads exactly.
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayNumber = (date: Date) => Date.parse(`${calendar.format(date)}T00:00:00Z`);
  return Math.round((dayNumber(when) - dayNumber(now)) / DAY_MS);
}

export function formatDueTime(closesAt: string, timeZone: string, now: Date): DueTime {
  const zone = zoneOrFallback(timeZone);
  const when = new Date(closesAt);
  const p = partsIn(when, zone);
  const days = calendarDaysBetween(now, when, zone);
  const day = days <= 0 ? "today" : days === 1 ? "tomorrow" : `on ${p.weekday}`;
  return {
    day,
    date: `${p.weekday}, ${p.month} ${p.day}`,
    time: `${p.hour}:${p.minute}`,
    zone: p.timeZoneName ?? zone,
  };
}

export function assignmentLink(origin: string, assignmentId: string): string {
  return `${origin.replace(/\/+$/, "")}/learn/assignments/${encodeURIComponent(assignmentId)}`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3).trimEnd()}...`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Copy {
  subject: string;
  heading: string;
  lines: string[];
  button: string;
}

function copyFor(content: ReminderContent): Copy {
  const title = oneLine(content.title);
  const subjectTitle = shorten(title, SUBJECT_TITLE_MAX);
  const due = formatDueTime(content.closesAt, content.timeZone, content.now);
  if (content.kind === "opened") {
    return {
      subject: `${subjectTitle} is open`,
      heading: `${title} is open in LeaRN.`,
      lines: [`It is due ${due.date} at ${due.time} ${due.zone}.`],
      button: "Open the assignment",
    };
  }
  return {
    subject: `${subjectTitle} closes ${due.day} at ${due.time}`,
    heading: `${title} closes ${due.day} at ${due.time} ${due.zone}, and you have not submitted it yet.`,
    lines: [
      `It closes ${due.date} at ${due.time} ${due.zone}. If you have started it, what you have saved by then is submitted for you.`,
    ],
    button: "Finish the assignment",
  };
}

const FOOTER = "Sent by LeaRN, an NCLEX practice app, because you are in a class that uses it.";

function renderText(copy: Copy, link: string): string {
  return [copy.heading, "", ...copy.lines, "", `${copy.button}: ${link}`, "", FOOTER, ""].join(
    "\n",
  );
}

const FONT = "font-family: Inter, Arial, Helvetica, sans-serif";

function renderHtml(copy: Copy, link: string): string {
  const href = escapeHtml(link);
  const paragraphs = copy.lines
    .map((line) => `<p style="margin: 0 0 24px">${escapeHtml(line)}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf9f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf9f6">
<tr><td align="center" style="padding: 32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #dddad4; border-radius: 8px">
<tr><td style="padding: 32px 28px; ${FONT}; color: #1b1d22; font-size: 16px; line-height: 1.5">
<p style="margin: 0 0 24px; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; color: #1f5596">LeaRN</p>
<h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.3; font-weight: 700">${escapeHtml(copy.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius: 6px; background-color: #1f5596">
<a href="${href}" style="display: inline-block; padding: 12px 24px; ${FONT}; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 6px">${escapeHtml(copy.button)}</a>
</td></tr></table>
<p style="margin: 24px 0 0; font-size: 14px; color: #5b5e66">Or paste this into your browser: ${href}</p>
</td></tr>
</table>
<p style="margin: 16px 0 0; max-width: 480px; ${FONT}; font-size: 12px; line-height: 1.5; color: #5b5e66">${escapeHtml(FOOTER)}</p>
</td></tr>
</table>
</body>
</html>
`;
}

export function renderReminderEmail(content: ReminderContent): RenderedReminder {
  const copy = copyFor(content);
  return {
    subject: copy.subject,
    text: renderText(copy, content.link),
    html: renderHtml(copy, content.link),
  };
}
