import { describe, expect, it, vi } from "vitest";
import { createMailpitMailer } from "./mailpit";
import { EmailError, type EmailMessage } from "./types";

const MESSAGE: EmailMessage = {
  to: "instructor@learn.test",
  subject: "Sign in to LeaRN",
  text: "Plain body",
  html: "<p>HTML body</p>",
  idempotencyKey: "k-1",
};

const SENDER = { name: "LeaRN", email: "learn@info.tannernielson.com" };

describe("createMailpitMailer", () => {
  it("posts to the local stack's Mailpit send API", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ID: "abc" }), { status: 200 }),
    ) as typeof fetch;
    const result = await createMailpitMailer(
      { baseUrl: "http://127.0.0.1:55324/", sender: SENDER },
      fetchImpl,
    ).send(MESSAGE);

    expect(result).toEqual({ id: "abc" });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("http://127.0.0.1:55324/api/v1/send");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      From: { Email: SENDER.email, Name: SENDER.name },
      To: [{ Email: MESSAGE.to }],
      Subject: MESSAGE.subject,
      Text: MESSAGE.text,
      HTML: MESSAGE.html,
      Headers: { "Idempotency-Key": MESSAGE.idempotencyKey },
    });
  });

  it("omits the sender name when there is none", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ID: "abc" }), { status: 200 }),
    ) as typeof fetch;
    await createMailpitMailer(
      { baseUrl: "http://127.0.0.1:55324", sender: { name: undefined, email: SENDER.email } },
      fetchImpl,
    ).send(MESSAGE);
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0][1]?.body)) as {
      From: object;
    };
    expect(body.From).toEqual({ Email: SENDER.email });
  });

  it("maps a refusal and an unreachable Mailpit to typed errors", async () => {
    const refusing = vi.fn(async () => new Response("bad", { status: 400 })) as typeof fetch;
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const config = { baseUrl: "http://127.0.0.1:55324", sender: SENDER };

    const refused = await createMailpitMailer(config, refusing)
      .send(MESSAGE)
      .catch((e) => e);
    const unreachable = await createMailpitMailer(config, down)
      .send(MESSAGE)
      .catch((e) => e);

    expect(refused).toBeInstanceOf(EmailError);
    expect((refused as EmailError).kind).toBe("rejected");
    expect((unreachable as EmailError).kind).toBe("network");
  });
});
