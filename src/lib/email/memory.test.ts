import { describe, expect, it } from "vitest";
import { createMemoryMailer } from "./memory";
import { EmailError, type EmailMessage } from "./types";

const MESSAGE: EmailMessage = {
  to: "student@example.com",
  subject: "Due tomorrow",
  text: "Plain",
  html: "<p>HTML</p>",
  idempotencyKey: "k-1",
};

describe("createMemoryMailer", () => {
  it("records each message and returns an id", async () => {
    const mailer = createMemoryMailer();
    const first = await mailer.send(MESSAGE);
    const second = await mailer.send({ ...MESSAGE, idempotencyKey: "k-2" });

    expect(first.id).not.toBe(second.id);
    expect(mailer.sent().map((m) => m.idempotencyKey)).toEqual(["k-1", "k-2"]);
  });

  it("sends a repeated idempotency key only once, like Resend", async () => {
    const mailer = createMemoryMailer();
    const first = await mailer.send(MESSAGE);
    const again = await mailer.send(MESSAGE);
    expect(again).toEqual(first);
    expect(mailer.sent()).toHaveLength(1);
  });

  it("hands out copies, so a caller cannot rewrite what was sent", async () => {
    const mailer = createMemoryMailer();
    await mailer.send(MESSAGE);
    const snapshot = mailer.sent();
    expect(() => (snapshot as EmailMessage[]).push(MESSAGE)).toThrow();
    expect(mailer.sent()).toHaveLength(1);
  });

  it("validates like the real adapters", async () => {
    const error = await createMemoryMailer()
      .send({ ...MESSAGE, to: "nope" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailError);
  });
});
