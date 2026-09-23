import type { Sender } from "./config";
import { postJson, requireId } from "./http";
import { validateMessage } from "./message";
import type { EmailMessage, Mailer, SentEmail } from "./types";

export interface MailpitConfig {
  /** The local stack's Mailpit, `http://127.0.0.1:55324` (supabase/config.toml `[local_smtp]`). */
  baseUrl: string;
  sender: Sender;
}

/**
 * Local development only: hands the message to the local Supabase stack's Mailpit through its
 * HTTP send API (`POST /api/v1/send`), so it shows up next to the magic-link emails without an
 * SMTP library. Mailpit keeps everything; nothing leaves the machine.
 */
export function createMailpitMailer(
  config: MailpitConfig,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/send`;
  const from = config.sender.name
    ? { Email: config.sender.email, Name: config.sender.name }
    : { Email: config.sender.email };
  return {
    async send(message: EmailMessage): Promise<SentEmail> {
      const { to, subject, text, html, idempotencyKey } = validateMessage(message);
      const reply = await postJson(
        fetchImpl,
        "Mailpit",
        url,
        { "Content-Type": "application/json" },
        {
          From: from,
          To: [{ Email: to }],
          Subject: subject,
          Text: text,
          HTML: html,
          Headers: { "Idempotency-Key": idempotencyKey },
        },
      );
      return { id: requireId("Mailpit", reply, "ID") };
    },
  };
}
