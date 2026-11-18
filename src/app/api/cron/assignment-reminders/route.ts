import { withCronMonitor } from "@/lib/observability/cronMonitor";
import { handleReminderCron } from "@/lib/reminders/cronRoute";
import { reminderCronDeps } from "@/lib/reminders/cronDeps";

/** A batch of sends plus the submit at close; Vercel Hobby allows up to 60 seconds. */
export const maxDuration = 60;

/**
 * The Sentry monitor for this job (#568): the same every-15-minutes schedule as the pg_cron job, five minutes'
 * grace before a run counts as missed, and `maxDuration` rounded up as the longest a run may take.
 */
const MONITOR = { crontab: "*/15 * * * *", checkinMargin: 5, maxRuntime: 2 } as const;

/**
 * pg_cron calls this every 15 minutes (ADR 0007): the submit at close for everyone, then the
 * reminder emails that are due. POST only, with `Authorization: Bearer <CRON_SECRET>`; any other
 * method gets Next's 405. See `handleReminderCron`. Each run checks in with Sentry when a DSN is
 * set, so a failed or missed run emails the alerts inbox (`withCronMonitor`).
 */
export const POST = withCronMonitor("assignment-reminders", MONITOR, (request) =>
  handleReminderCron(request, reminderCronDeps()),
);
