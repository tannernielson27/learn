import { z } from "zod";
import { EmailError, type EmailMessage } from "./types";

const SUBJECT_MAX = 200;
// Resend's documented limit for Idempotency-Key.
const IDEMPOTENCY_KEY_MAX = 256;

const messageSchema = z.object({
  to: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(SUBJECT_MAX)
    .regex(/^[^\r\n]*$/),
  text: z.string().min(1),
  html: z.string().min(1),
  // Sent as an HTTP header, so only characters that cannot end or split one.
  idempotencyKey: z
    .string()
    .min(1)
    .max(IDEMPOTENCY_KEY_MAX)
    .regex(/^[\w:.-]+$/),
});

/**
 * Checks a message before any adapter sends it and returns a normalised copy. The error names the
 * field that is wrong and never its value, so it can be logged without leaking an address.
 */
export function validateMessage(message: EmailMessage): EmailMessage {
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new EmailError("invalid", `The email could not be sent: check ${fields.join(", ")}.`);
  }
  return parsed.data;
}
