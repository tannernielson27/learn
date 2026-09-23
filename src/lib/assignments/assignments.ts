/**
 * Assignments (#207): a bank or a case study given to a class, with a window and 1 to 3 attempts.
 * The window is typed and shown in the viewer's local time and stored as an instant (timestamptz):
 * the browser turns its `datetime-local` value into an ISO string before the form is sent, so the
 * server never has to guess anyone's zone. Pure: no React, no Next, no Supabase.
 */

import { isUuid } from "@/lib/authoring/ids";

/** Owner decision 2026-09-23: one attempt by default, up to three, the best one counts. */
export const ATTEMPT_CHOICES = [1, 2, 3] as const;
export const DEFAULT_ATTEMPTS = 1;

/** The default close: the day after today, at this hour, in the viewer's zone. */
const DEFAULT_CLOSE_HOUR = 17;

export type AssignmentState = "scheduled" | "open" | "closed";

export const STATE_LABEL: Readonly<Record<AssignmentState, string>> = {
  scheduled: "Not yet open",
  open: "Open",
  closed: "Closed",
};

export type AssignmentSource = { kind: "bank"; id: string } | { kind: "case_study"; id: string };

export function assignmentPath(source: AssignmentSource): string {
  return source.kind === "bank"
    ? `/author/banks/${source.id}/assign`
    : `/author/case-studies/${source.id}/assign`;
}

export function attemptsLabel(count: number): string {
  return count === 1 ? "1 attempt" : `${count} attempts`;
}

export function assignmentState(opensAt: string, closesAt: string, now: Date): AssignmentState {
  const at = now.getTime();
  if (at < Date.parse(opensAt)) return "scheduled";
  if (at < Date.parse(closesAt)) return "open";
  return "closed";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DDTHH:mm` in the zone this code runs in: the value a `datetime-local` input takes. */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A `datetime-local` value read as local time, as an ISO instant; null for anything else,
 * including a date that does not exist (the 40th) or a local time a clock change skips.
 */
export function localInputToIso(value: string): string | null {
  const match = LOCAL_INPUT.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const date = new Date(year, month - 1, day, hour, minute, second);
  const roundTrips =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  return roundTrips ? date.toISOString() : null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

interface TimeParts {
  weekday: number;
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
}

/** "Thu 24 Sep 2026, 17:00". Built by hand, not by Intl, so it reads the same in every engine. */
function formatParts(parts: TimeParts): string {
  return (
    `${WEEKDAYS[parts.weekday]} ${parts.day} ${MONTHS[parts.month]} ${parts.year}, ` +
    `${pad(parts.hour)}:${pad(parts.minute)}`
  );
}

/** An instant in the zone this code runs in, or in UTC. */
export function formatInstant(iso: string, zone: "local" | "utc"): string {
  const date = new Date(iso);
  return zone === "local"
    ? formatParts({
        weekday: date.getDay(),
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      })
    : formatParts({
        weekday: date.getUTCDay(),
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
      });
}

/** A typed `datetime-local` value, formatted as it will be shown back; null if it is not one. */
export function formatLocalInput(value: string): string | null {
  const iso = localInputToIso(value);
  return iso === null ? null : formatInstant(iso, "local");
}

/** Opening now, closing tomorrow at 17:00, as `datetime-local` values. */
export function defaultWindow(now: Date): { opensAt: string; closesAt: string } {
  const close = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, DEFAULT_CLOSE_HOUR);
  return { opensAt: toLocalInputValue(now), closesAt: toLocalInputValue(close) };
}

// ---------------------------------------------------------------------------
// The forms, read on the server
// ---------------------------------------------------------------------------

export interface AssignmentWindowInput {
  opensAt: string;
  closesAt: string;
  maxAttempts: number;
  shuffleOptions: boolean;
}

export interface AssignmentInput extends AssignmentWindowInput {
  classId: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const ASSIGNMENT_ERRORS = {
  class: "Choose a class.",
  attempts: "Allow 1, 2 or 3 attempts.",
  times: "Enter an open time and a close time.",
  closeTime: "Enter a close time.",
  order: "The close time must be after the open time.",
  past: "The close time has already passed.",
} as const;

/** An instant the browser sent, normalised, or null. */
function readInstant(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.length === 0) return null;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function readAttempts(formData: FormData): number | null {
  const raw = formData.get("maxAttempts");
  const count = typeof raw === "string" && /^\d$/.test(raw) ? Number(raw) : NaN;
  return (ATTEMPT_CHOICES as readonly number[]).includes(count) ? count : null;
}

/** The window, the attempts and shuffling: what may change until the assignment opens. */
export function parseAssignmentEdit(formData: FormData, now: Date): Parsed<AssignmentWindowInput> {
  const maxAttempts = readAttempts(formData);
  if (maxAttempts === null) return { ok: false, error: ASSIGNMENT_ERRORS.attempts };
  const opensAt = readInstant(formData, "opensAt");
  const closesAt = readInstant(formData, "closesAt");
  if (opensAt === null || closesAt === null) return { ok: false, error: ASSIGNMENT_ERRORS.times };
  if (Date.parse(closesAt) <= Date.parse(opensAt)) {
    return { ok: false, error: ASSIGNMENT_ERRORS.order };
  }
  if (Date.parse(closesAt) <= now.getTime()) return { ok: false, error: ASSIGNMENT_ERRORS.past };
  return {
    ok: true,
    value: {
      opensAt,
      closesAt,
      maxAttempts,
      shuffleOptions: formData.get("shuffleOptions") === "on",
    },
  };
}

/** The Assign form: a class as well as the window. */
export function parseAssignmentForm(formData: FormData, now: Date): Parsed<AssignmentInput> {
  const classId = formData.get("classId");
  if (typeof classId !== "string" || !isUuid(classId)) {
    return { ok: false, error: ASSIGNMENT_ERRORS.class };
  }
  const parsed = parseAssignmentEdit(formData, now);
  return parsed.ok ? { ok: true, value: { classId, ...parsed.value } } : parsed;
}

/** Once it has opened, only the close time changes, and never into the past. */
export function parseCloseTime(formData: FormData, now: Date): Parsed<{ closesAt: string }> {
  const closesAt = readInstant(formData, "closesAt");
  if (closesAt === null) return { ok: false, error: ASSIGNMENT_ERRORS.closeTime };
  if (Date.parse(closesAt) <= now.getTime()) return { ok: false, error: ASSIGNMENT_ERRORS.past };
  return { ok: true, value: { closesAt } };
}
