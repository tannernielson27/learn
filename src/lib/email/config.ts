import { z } from "zod";
import { EmailError } from "./types";

export interface Sender {
  name: string | undefined;
  email: string;
}

export interface EmailConfig {
  apiKey: string;
  /** Exactly as configured, e.g. `LeaRN <learn@info.tannernielson.com>`. */
  from: string;
  sender: Sender;
}

export interface RawEmailConfig {
  apiKey: string | undefined;
  from: string | undefined;
  /** NEXT_PUBLIC_RESEND_API_KEY: must never be set, since Next would inline it into the browser. */
  publicApiKey?: string | undefined;
}

const KEY_VAR = "RESEND_API_KEY";
const FROM_VAR = "EMAIL_FROM";
const SEE = "See .env.example and docs/05 §7.7.";

const addressSchema = z.string().max(254).pipe(z.email());
// `Name <address>` or a bare address. No line breaks, commas or angle brackets in the name, so
// the value cannot smuggle a second header or a second sender.
const SENDER_FORM = /^(?:([^<>,\r\n]+?)\s*<([^<>\s,]+)>|([^<>\s,]+))$/;
const RESEND_KEY = /^re_[A-Za-z0-9_]{8,}$/;

/** Splits `Name <address>` (or a bare address); undefined when it is neither. */
export function parseSender(value: string): Sender | undefined {
  const match = SENDER_FORM.exec(value);
  if (!match) return undefined;
  const email = addressSchema.safeParse(match[2] ?? match[3]);
  if (!email.success) return undefined;
  return { name: match[1]?.trim() || undefined, email: email.data };
}

const configSchema = z.object({
  apiKey: z
    .string({ error: `${KEY_VAR} is not set. ${SEE}` })
    .trim()
    .min(1, { error: `${KEY_VAR} is not set. ${SEE}` })
    .regex(RESEND_KEY, { error: `${KEY_VAR} does not look like a Resend API key (re_...).` }),
  from: z
    .string({ error: `${FROM_VAR} is not set. ${SEE}` })
    .trim()
    .min(1, { error: `${FROM_VAR} is not set. ${SEE}` })
    .refine((value) => parseSender(value) !== undefined, {
      error: `${FROM_VAR} must be an address, optionally with a name: LeaRN <learn@info.tannernielson.com>.`,
    }),
});

/**
 * Reads the mail settings on the server, lazily: nothing calls this until a message is sent, so a
 * page never fails because email is not configured. Neither variable has a NEXT_PUBLIC_ prefix, so
 * Next leaves them out of every browser bundle. Error messages name the variable, never its value.
 */
export function readEmailConfig(
  raw: RawEmailConfig = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    publicApiKey: process.env.NEXT_PUBLIC_RESEND_API_KEY,
  },
): EmailConfig {
  if (raw.publicApiKey?.trim()) {
    throw new EmailError(
      "config",
      `NEXT_PUBLIC_RESEND_API_KEY is set, which ships the key to every browser. Remove it, rotate the key in Resend, and set ${KEY_VAR} instead.`,
    );
  }
  const parsed = configSchema.safeParse({ apiKey: raw.apiKey, from: raw.from });
  if (!parsed.success) {
    throw new EmailError("config", parsed.error.issues[0]?.message ?? `Email is not configured.`);
  }
  const { apiKey, from } = parsed.data;
  return { apiKey, from, sender: parseSender(from) as Sender };
}
