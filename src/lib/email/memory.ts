import { validateMessage } from "./message";
import type { EmailMessage, Mailer, SentEmail } from "./types";

export interface MemoryMailer extends Mailer {
  /** Everything sent so far, oldest first, as a frozen copy. */
  sent(): readonly EmailMessage[];
}

/**
 * For tests: keeps messages in memory and, like Resend, sends a repeated idempotency key once.
 * Each call returns a fresh mailer, so tests never share state.
 */
export function createMemoryMailer(): MemoryMailer {
  let outbox: readonly { message: EmailMessage; id: string }[] = [];
  return {
    async send(message: EmailMessage): Promise<SentEmail> {
      const valid = validateMessage(message);
      const earlier = outbox.find((entry) => entry.message.idempotencyKey === valid.idempotencyKey);
      if (earlier) return { id: earlier.id };
      const id = `memory-${outbox.length + 1}`;
      outbox = [...outbox, { message: Object.freeze({ ...valid }), id }];
      return { id };
    },
    sent() {
      return Object.freeze(outbox.map((entry) => entry.message));
    },
  };
}
