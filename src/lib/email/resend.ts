import { postJson, requireId } from "./http";
import { validateMessage } from "./message";
import type { EmailMessage, Mailer, SentEmail } from "./types";

/** https://resend.com/docs/api-reference/emails/send-email */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendConfig {
  apiKey: string;
  from: string;
}

/**
 * Sends through Resend's HTTP API with plain `fetch`, so there is no SDK to keep in step. One
 * recipient per call; the Idempotency-Key header makes a retried send a no-op for 24 hours.
 * It never logs: no address, no body, no key.
 */
export function createResendMailer(config: ResendConfig, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send(message: EmailMessage): Promise<SentEmail> {
      const { to, subject, text, html, idempotencyKey } = validateMessage(message);
      const reply = await postJson(
        fetchImpl,
        "Resend",
        RESEND_ENDPOINT,
        {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        { from: config.from, to: [to], subject, text, html },
      );
      return { id: requireId("Resend", reply, "id") };
    },
  };
}
