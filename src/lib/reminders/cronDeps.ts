import { autoSubmitExpired } from "@/lib/assignments/submitAttempt";
import { autoSubmitStore } from "@/lib/assignments/attemptStore";
import { getMailer } from "@/lib/email";
import { canonicalSiteOrigin } from "@/lib/http/siteOrigin";
import { createReminderStore } from "@/lib/supabase/reminders";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ReminderCronDeps } from "./cronRoute";

/** Open attempts submitted per run; the rest wait 15 minutes, or for the student's own visit. */
export const CRON_AUTO_SUBMIT_BATCH = 100;

/**
 * The real dependencies of the reminder route. Everything is created per request and only once the
 * secret has been checked (the route calls these lazily), so an unauthorised request never builds
 * a service-role client.
 */
export function reminderCronDeps(): ReminderCronDeps {
  let service: ReturnType<typeof createSupabaseServiceClient> | undefined;
  const serviceClient = () => (service ??= createSupabaseServiceClient());
  return {
    secret: process.env.CRON_SECRET,
    store: () => createReminderStore(serviceClient()),
    mailer: getMailer,
    autoSubmit: () =>
      autoSubmitExpired(autoSubmitStore(serviceClient()), { limit: CRON_AUTO_SUBMIT_BATCH }),
    origin: (headers) => canonicalSiteOrigin(headers),
  };
}
