/**
 * Sending what the outbox says is due (#212). The database decides who is owed which email and
 * remembers what was sent (`private.email_outbox`, one row per assignment, student and kind); this
 * enqueues, claims a batch, renders and sends each through the Mailer, and records the outcome.
 *
 * - Sent: marked sent, never claimed again.
 * - A failure retrying can fix (Resend down, no reply, 429): tried again after a backoff that is
 *   at least Resend's Retry-After. The database gives up after five tries.
 * - A 429 also stops the batch: the rest are handed back untried, due after the Retry-After.
 * - A failure retrying cannot fix (the message or address was refused): given up at once.
 * - Email not configured (no RESEND_API_KEY on the deployment): that is ours to fix, not the
 *   student's, so the whole batch is handed back untried and nobody's reminder is given up.
 *
 * Logs carry counts and error kinds only. A recipient's address never reaches a log line, and
 * neither does an error's message, which could (the Mailer's own never do, but a thrown TypeError
 * from anywhere else might).
 */
import { EmailError, type EmailErrorKind, type Mailer } from "@/lib/email";
import { assignmentLink, renderReminderEmail, type ReminderKind } from "./reminderEmail";

export interface ReminderRow {
  outboxId: string;
  assignmentId: string;
  studentId: string;
  kind: ReminderKind;
  /** Null when the account has no address; given up without a send. */
  email: string | null;
  title: string;
  closesAt: string;
  timeZone: string;
  /** Claims so far, this one included. */
  tries: number;
}

export type FailOutcome = "retrying" | "failed" | "not_found";

/** The outbox; `createReminderStore` in src/lib/supabase/reminders.ts is the real one. */
export interface ReminderStore {
  enqueue(): Promise<{ opened: number; closingSoon: number }>;
  claim(limit: number): Promise<ReminderRow[]>;
  complete(outboxId: string, providerId: string): Promise<void>;
  /** `retryInSeconds` null gives up now. */
  fail(outboxId: string, errorKind: string, retryInSeconds: number | null): Promise<FailOutcome>;
  release(outboxIds: readonly string[], retryInSeconds: number): Promise<void>;
}

export interface ReminderRunResult {
  enqueued: { opened: number; closingSoon: number };
  sent: number;
  retrying: number;
  failed: number;
  /** Handed back untried, after a 429 or with email not configured. */
  deferred: number;
}

export type ReminderLog = (message: string, details: Record<string, string | number>) => void;

export interface SendOptions {
  /** Where the link in each email points: `canonicalSiteOrigin`. */
  origin: string;
  now: Date;
  /** How many to claim in one run. Resend allows a few a second; this stays well inside a run. */
  batch?: number;
  log?: ReminderLog;
}

export const DEFAULT_BATCH = 20;
const BASE_BACKOFF_SECONDS = 300;
export const MAX_BACKOFF_SECONDS = 6 * 3600;
/** A deployment without email: try the batch again at the next run or so. */
const NOT_CONFIGURED_RETRY_SECONDS = 900;

/** Resend keeps a key for 24 hours; built from what the email is about, never the address. */
export function reminderIdempotencyKey(
  row: Pick<ReminderRow, "assignmentId" | "studentId" | "kind">,
): string {
  return `reminder:${row.assignmentId}:${row.studentId}:${row.kind}`;
}

/** Five minutes, doubling with each try, capped at six hours; never sooner than Retry-After. */
export function retryDelaySeconds(tries: number, retryAfterSeconds?: number): number {
  const exponent = Math.max(0, Math.min(tries, 20) - 1);
  const backoff = Math.min(BASE_BACKOFF_SECONDS * 2 ** exponent, MAX_BACKOFF_SECONDS);
  return Math.max(backoff, Math.ceil(retryAfterSeconds ?? 0));
}

type Outcome =
  | { type: "sent" }
  | { type: "retrying" }
  | { type: "failed" }
  /**
   * Stop the batch and hand the rest back. `recorded` is what happened to this row: counted as a
   * retry or a failure, or null when it goes back with the rest (email not configured).
   */
  | { type: "stop"; retryInSeconds: number; recorded: "retrying" | "failed" | null };

interface Failure {
  kind: EmailErrorKind;
  retryable: boolean;
  retryAfterSeconds: number | undefined;
}

function classify(error: unknown): Failure {
  if (error instanceof EmailError) {
    return {
      kind: error.kind,
      retryable: error.retryable,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  // Something other than the Mailer threw. Treat it like an outage rather than blaming the student.
  return { kind: "unavailable", retryable: true, retryAfterSeconds: undefined };
}

async function sendOne(
  store: ReminderStore,
  mailer: Mailer,
  row: ReminderRow,
  options: SendOptions,
): Promise<Outcome> {
  if (!row.email) {
    await store.fail(row.outboxId, "invalid", null);
    return { type: "failed" };
  }
  const rendered = renderReminderEmail({
    kind: row.kind,
    title: row.title,
    closesAt: row.closesAt,
    timeZone: row.timeZone,
    link: assignmentLink(options.origin, row.assignmentId),
    now: options.now,
  });
  try {
    const sent = await mailer.send({
      to: row.email,
      ...rendered,
      idempotencyKey: reminderIdempotencyKey(row),
    });
    await store.complete(row.outboxId, sent.id);
    return { type: "sent" };
  } catch (error) {
    return recordFailure(store, row, classify(error), options.log);
  }
}

async function recordFailure(
  store: ReminderStore,
  row: ReminderRow,
  failure: Failure,
  log: ReminderLog | undefined,
): Promise<Outcome> {
  if (failure.kind === "config") {
    log?.("[reminders] email is not configured", { kind: failure.kind });
    return { type: "stop", retryInSeconds: NOT_CONFIGURED_RETRY_SECONDS, recorded: null };
  }
  const retryIn = failure.retryable
    ? retryDelaySeconds(row.tries, failure.retryAfterSeconds)
    : null;
  const outcome = await store.fail(row.outboxId, failure.kind, retryIn);
  log?.("[reminders] a reminder was not sent", { kind: failure.kind, outcome, tries: row.tries });
  const recorded = outcome === "retrying" ? "retrying" : "failed";
  if (failure.kind === "rate_limited") {
    return { type: "stop", retryInSeconds: Math.ceil(failure.retryAfterSeconds ?? 60), recorded };
  }
  return { type: recorded };
}

export async function sendDueReminders(
  store: ReminderStore,
  mailer: Mailer,
  options: SendOptions,
): Promise<ReminderRunResult> {
  const enqueued = await store.enqueue();
  const claimed = await store.claim(options.batch ?? DEFAULT_BATCH);
  const tally = { sent: 0, retrying: 0, failed: 0, deferred: 0 };

  for (const [index, row] of claimed.entries()) {
    const outcome = await sendOne(store, mailer, row, options);
    if (outcome.type !== "stop") {
      tally[outcome.type] += 1;
      continue;
    }
    const rest = claimed.slice(index + 1).map((r) => r.outboxId);
    const handBack = outcome.recorded === null ? [row.outboxId, ...rest] : rest;
    if (outcome.recorded !== null) tally[outcome.recorded] += 1;
    if (handBack.length > 0) await store.release(handBack, outcome.retryInSeconds);
    tally.deferred += handBack.length;
    break;
  }

  return { enqueued, ...tally };
}
