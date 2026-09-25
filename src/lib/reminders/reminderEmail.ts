/**
 * The two reminder emails (#212): "Week 5 is open" and "Week 5 closes tomorrow at 17:00".
 *
 * Short plain text plus HTML in the shared LeaRN layout (`src/lib/email/layout.ts`, #268), the same
 * one the magic-link template is generated from. The due time is in the class's time zone on a
 * 24-hour clock with the zone's short name, so "17:00 MDT" means the same thing to everyone reading
 * it.
 *
 * Pure: no Next, no Supabase, no environment. `now` is a parameter so "today" and "tomorrow" can be
 * tested.
 */
import { renderEmailDocument, type EmailLayout } from "@/lib/email/layout";

export type ReminderKind = "opened" | "closing_soon";

export interface ReminderContent {
  kind: ReminderKind;
  title: string;
  /**
   * The class's name, when the caller has it. The outbox claim does not return it yet, so a sent
   * reminder has no class line until it does; the preview shows one.
   */
  className?: string;
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
  const className = content.className === undefined ? "" : oneLine(content.className);
  const forClass = className === "" ? [] : [`For ${className}.`];
  if (content.kind === "opened") {
    return {
      subject: `${subjectTitle} is open`,
      heading: `${title} is open in LeaRN.`,
      lines: [...forClass, `It is due ${due.date} at ${due.time} ${due.zone}.`],
      button: "Open the assignment",
    };
  }
  return {
    subject: `${subjectTitle} closes ${due.day} at ${due.time}`,
    heading: `${title} closes ${due.day} at ${due.time} ${due.zone}, and you have not submitted it yet.`,
    lines: [
      ...forClass,
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

/** The HTML part, in the shared layout. Every string is escaped there, the link included. */
function layoutFor(copy: Copy, link: string): EmailLayout {
  return {
    title: copy.subject,
    heading: copy.heading,
    paragraphs: copy.lines,
    action: { label: copy.button, href: link },
    footer: FOOTER,
  };
}

/** The HTML part's layout, for a preview that renders it inside a page. */
export function reminderLayout(content: ReminderContent): EmailLayout {
  return layoutFor(copyFor(content), content.link);
}

export function renderReminderEmail(content: ReminderContent): RenderedReminder {
  const copy = copyFor(content);
  return {
    subject: copy.subject,
    text: renderText(copy, content.link),
    html: renderEmailDocument(layoutFor(copy, content.link)),
  };
}
