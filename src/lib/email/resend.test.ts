import { describe, expect, it, vi } from "vitest";
import { RESEND_ENDPOINT, createResendMailer } from "./resend";
import { EmailError, type EmailMessage } from "./types";

const CONFIG = {
  apiKey: "re_test_0123456789abcdef",
  from: "LeaRN <learn@info.tannernielson.com>",
};

const MESSAGE: EmailMessage = {
  to: "student@example.com",
  subject: "Your assignment is due tomorrow",
  text: "Plain body",
  html: "<p>HTML body</p>",
  idempotencyKey: "reminder:assignment-1:student-1",
};

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

async function sendError(fetchImpl: typeof fetch, message = MESSAGE): Promise<EmailError> {
  const mailer = createResendMailer(CONFIG, fetchImpl);
  const error = await mailer.send(message).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(EmailError);
  return error as EmailError;
}

describe("createResendMailer", () => {
  it("posts one message to Resend with the key, the sender and an idempotency key", async () => {
    const fetchImpl = respond(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    const result = await createResendMailer(CONFIG, fetchImpl).send(MESSAGE);

    expect(result).toEqual({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${CONFIG.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": MESSAGE.idempotencyKey,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: CONFIG.from,
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it("does not change the message it was given", async () => {
    const message = Object.freeze({ ...MESSAGE });
    await createResendMailer(CONFIG, respond(200, { id: "x" })).send(message);
    expect(message).toEqual(MESSAGE);
  });

  it.each([
    [400, "rejected", false],
    [401, "rejected", false],
    [403, "rejected", false],
    [409, "rejected", false],
    [422, "rejected", false],
    [429, "rate_limited", true],
    [500, "unavailable", true],
    [503, "unavailable", true],
  ] as const)("maps HTTP %i to a %s error (retryable: %s)", async (status, kind, retryable) => {
    const error = await sendError(
      respond(status, {
        statusCode: status,
        name: "validation_error",
        message: `Invalid \`to\` field: ${MESSAGE.to}`,
      }),
    );
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(retryable);
    expect(error.message).toContain(String(status));
  });

  it("carries Retry-After on a 429 so a retry loop knows how long to wait", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: "rate_limit_exceeded" }), {
          status: 429,
          headers: { "retry-after": "7" },
        }),
    ) as typeof fetch;
    const error = await sendError(fetchImpl);
    expect(error.retryAfterSeconds).toBe(7);
  });

  it("leaves Retry-After unset when the header is missing or not a number", async () => {
    expect((await sendError(respond(429, {}))).retryAfterSeconds).toBeUndefined();
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 429, headers: { "retry-after": "soon" } }),
    ) as typeof fetch;
    expect((await sendError(fetchImpl)).retryAfterSeconds).toBeUndefined();
  });

  it("keeps Resend's error code but never its message, which can echo the recipient", async () => {
    const error = await sendError(
      respond(422, { name: "validation_error", message: `Invalid to: ${MESSAGE.to}` }),
    );
    expect(error.code).toBe("validation_error");
    expect(error.message).toContain("validation_error");
    expect(error.message).not.toContain(MESSAGE.to);
  });

  it("ignores an error code that is not a plain identifier", async () => {
    const error = await sendError(respond(400, { name: `oops ${MESSAGE.to}` }));
    expect(error.code).toBeUndefined();
    expect(error.message).not.toContain(MESSAGE.to);
  });

  it("copes with an error body that is not JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>Bad gateway</html>", { status: 502 }),
    ) as typeof fetch;
    const error = await sendError(fetchImpl);
    expect(error.kind).toBe("unavailable");
    expect(error.code).toBeUndefined();
  });

  it("maps a failed request to a retryable network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const error = await sendError(fetchImpl);
    expect(error.kind).toBe("network");
    expect(error.retryable).toBe(true);
    expect(error.status).toBeUndefined();
  });

  it("gives every request a deadline, and a request that runs past it is a retryable network error", async () => {
    let signal: AbortSignal | null | undefined;
    const hangs = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as typeof fetch;
    const error = await sendError(hangs);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(error.kind).toBe("network");
    expect(error.retryable).toBe(true);
  });

  it("treats a 2xx without an id as unavailable rather than sent", async () => {
    const error = await sendError(respond(200, { nope: true }));
    expect(error.kind).toBe("unavailable");
  });

  it("refuses an invalid message before calling Resend, without echoing it", async () => {
    const fetchImpl = respond(200, { id: "x" });
    const error = await sendError(fetchImpl, { ...MESSAGE, to: "not an address" });
    expect(error.kind).toBe("invalid");
    expect(error.message).not.toContain("not an address");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
