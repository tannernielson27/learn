/**
 * App email (#206). Server-only: import it from Server Functions, route handlers and jobs, never
 * from a Client Component. `noClientEmail.test.ts` fails the build if a browser bundle reaches it.
 *
 * Magic links do not come through here: Supabase Auth sends those itself, over Resend's SMTP
 * (docs/05 §7.7). This is for the app's own transactional mail, such as reminders (#212).
 */
import { parseSender, readEmailConfig } from "./config";
import { createMailpitMailer } from "./mailpit";
import { createResendMailer } from "./resend";
import type { Mailer } from "./types";

export { EmailError } from "./types";
export type { EmailErrorKind, EmailMessage, Mailer, SentEmail } from "./types";

export interface MailerEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NEXT_PUBLIC_RESEND_API_KEY?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  SUPABASE_MAILBOX_URL?: string;
}

const LOCAL_MAILBOX = "http://127.0.0.1:55324";
const LOCAL_SENDER = { name: "LeaRN", email: "learn@learn.test" };

/**
 * Picks the transport, without throwing. Configuration is checked when something is sent, so a
 * page or route that merely imports this never fails for want of a key:
 *
 * - RESEND_API_KEY set: Resend, from EMAIL_FROM.
 * - No key, local development or tests (not a production build, not on Vercel): the local stack's
 *   Mailpit, where the magic links already land.
 * - No key anywhere else: every send fails with a `config` EmailError naming RESEND_API_KEY.
 */
export function createMailer(env: MailerEnv, fetchImpl: typeof fetch = fetch): Mailer {
  const isLocal = env.NODE_ENV !== "production" && !env.VERCEL;
  if (!env.RESEND_API_KEY?.trim() && isLocal) {
    return createMailpitMailer(
      {
        baseUrl: env.SUPABASE_MAILBOX_URL?.trim() || LOCAL_MAILBOX,
        sender: parseSender(env.EMAIL_FROM?.trim() ?? "") ?? LOCAL_SENDER,
      },
      fetchImpl,
    );
  }
  return {
    async send(message) {
      const config = readEmailConfig({
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        publicApiKey: env.NEXT_PUBLIC_RESEND_API_KEY,
      });
      return createResendMailer(config, fetchImpl).send(message);
    },
  };
}

/** The mailer for this deployment, read from the server's environment at call time. */
export function getMailer(): Mailer {
  return createMailer({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    NEXT_PUBLIC_RESEND_API_KEY: process.env.NEXT_PUBLIC_RESEND_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    SUPABASE_MAILBOX_URL: process.env.SUPABASE_MAILBOX_URL,
  });
}
