import { handleReminderCron } from "@/lib/reminders/cronRoute";
import { reminderCronDeps } from "@/lib/reminders/cronDeps";

/** A batch of sends plus the submit at close; Vercel Hobby allows up to 60 seconds. */
export const maxDuration = 60;

/**
 * pg_cron calls this every 15 minutes (ADR 0007): the submit at close for everyone, then the
 * reminder emails that are due. POST only, with `Authorization: Bearer <CRON_SECRET>`; any other
 * method gets Next's 405. See `handleReminderCron`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleReminderCron(request, reminderCronDeps());
}
