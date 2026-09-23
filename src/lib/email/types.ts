/** One transactional message to one person. Server-side only (see `noClientEmail.test.ts`). */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /**
   * The same key sends at most once. Resend keeps it for 24 hours, so a retried reminder job
   * does not mail anyone twice. Build it from what the message is about, never from the address:
   * `reminder:<assignmentId>:<userId>`.
   */
  readonly idempotencyKey: string;
}

export interface SentEmail {
  readonly id: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<SentEmail>;
}

/**
 * - `config`: RESEND_API_KEY or EMAIL_FROM is missing or malformed.
 * - `invalid`: the message itself is wrong; nothing was sent.
 * - `rejected`: the provider refused it (4xx). Retrying the same request will not help.
 * - `rate_limited`: 429. Retry later.
 * - `unavailable`: 5xx, or a reply we could not read. Retry later.
 * - `network`: the request never got a reply. Retry later.
 */
export type EmailErrorKind =
  "config" | "invalid" | "rejected" | "rate_limited" | "unavailable" | "network";

const RETRYABLE: ReadonlySet<EmailErrorKind> = new Set(["rate_limited", "unavailable", "network"]);

/**
 * Why a send failed. The message names what went wrong and never carries a recipient's address,
 * a message body or a key, so it is safe to log.
 */
export class EmailError extends Error {
  readonly kind: EmailErrorKind;
  readonly retryable: boolean;
  readonly status: number | undefined;
  /** The provider's machine-readable error name, e.g. `validation_error`, when it gave one. */
  readonly code: string | undefined;

  constructor(
    kind: EmailErrorKind,
    message: string,
    details: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "EmailError";
    this.kind = kind;
    this.retryable = RETRYABLE.has(kind);
    this.status = details.status;
    this.code = details.code;
  }
}
