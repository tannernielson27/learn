import { describe, expect, it } from "vitest";
import { validateMessage } from "./message";
import { EmailError, type EmailMessage } from "./types";

const MESSAGE: EmailMessage = {
  to: "  Student@Example.com ",
  subject: "Your assignment is due tomorrow",
  text: "Plain body",
  html: "<p>HTML body</p>",
  idempotencyKey: "reminder:assignment-1:student-1",
};

function invalid(message: EmailMessage): EmailError {
  try {
    validateMessage(message);
  } catch (error) {
    expect(error).toBeInstanceOf(EmailError);
    expect((error as EmailError).kind).toBe("invalid");
    expect((error as EmailError).retryable).toBe(false);
    return error as EmailError;
  }
  throw new Error("expected an invalid-message error");
}

describe("validateMessage", () => {
  it("returns a normalised copy and leaves the input alone", () => {
    const input = Object.freeze({ ...MESSAGE });
    expect(validateMessage(input)).toEqual({ ...MESSAGE, to: "student@example.com" });
    expect(input.to).toBe(MESSAGE.to);
  });

  it("names the field that is wrong, never its value", () => {
    const error = invalid({ ...MESSAGE, to: "someone at example dot com" });
    expect(error.message).toMatch(/\bto\b/);
    expect(error.message).not.toContain("someone at example");
  });

  it.each([
    ["an empty subject", { subject: "  " }],
    ["a subject with a line break (header injection)", { subject: "Hi\r\nBcc: x@y.co" }],
    ["a subject over 200 characters", { subject: "x".repeat(201) }],
    ["an empty text body", { text: "" }],
    ["an empty html body", { html: "" }],
    ["an empty idempotency key", { idempotencyKey: "" }],
    ["an idempotency key over 256 characters", { idempotencyKey: "k".repeat(257) }],
    ["an address list instead of one address", { to: "a@b.co, c@d.co" }],
  ])("refuses %s", (_name, change) => {
    invalid({ ...MESSAGE, ...change });
  });
});
