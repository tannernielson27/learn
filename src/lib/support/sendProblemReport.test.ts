import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailError, type Mailer } from "@/lib/email";
import { createMemoryMailer } from "@/lib/email/memory";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { createProblemReportLimiter, type ProblemReportLimiter } from "./problemReportLimit";
import { PROBLEM_COPY, PROBLEM_FIELDS } from "./problemReportForm";
import { sendProblemReport, type ProblemReportDeps, type ProblemSender } from "./sendProblemReport";

const TEACHER: ProblemSender = {
  status: "signed_in",
  userId: "user-1",
  email: "teacher@example.com",
  role: "teacher",
  displayName: "Pat Rivera",
};

const EVENT_ID = "0123456789abcdef0123456789abcdef";

function form(fields: Partial<Record<keyof typeof PROBLEM_FIELDS, string>> = {}): FormData {
  const data = new FormData();
  const values = {
    message: "The live session froze on question 3.",
    page: "/author/items/abc",
    reference: "",
    eventId: "",
    trap: "",
    ...fields,
  };
  for (const [key, value] of Object.entries(values)) {
    data.set(PROBLEM_FIELDS[key as keyof typeof PROBLEM_FIELDS], value);
  }
  return data;
}

function harness(overrides: Partial<ProblemReportDeps> = {}) {
  const mailer = createMemoryMailer();
  const feedback = vi.fn();
  const deps: ProblemReportDeps = {
    viewer: async () => TEACHER,
    mailer: () => mailer,
    limiter: createProblemReportLimiter(createMemoryRateLimitStore()),
    feedback,
    env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "3ae4ba1c0ffee0000" },
    newId: () => "id-1",
    ...overrides,
  };
  return { deps, mailer, feedback };
}

afterEach(() => vi.restoreAllMocks());

describe("sendProblemReport", () => {
  it("emails support@ with Reply-To set to the sender, and thanks them by address", async () => {
    const { deps, mailer } = harness();
    const state = await sendProblemReport(form(), deps);

    expect(state).toEqual({ status: "sent", replyTo: "teacher@example.com" });
    const [sent] = mailer.sent();
    expect(sent.to).toBe("support@learnursing.app");
    expect(sent.replyTo).toBe("teacher@example.com");
    expect(sent.subject).toBe("Problem: The live session froze on question 3.");
    expect(sent.text).toContain("Page: /author/items/abc");
    expect(sent.text).toContain("Version: 3ae4ba1c0ffe (production)");
    expect(sent.idempotencyKey).toBe("problem-report:user-1:id-1");
    expect(sent.idempotencyKey).not.toContain("@");
  });

  it("attaches scrubbed feedback to the Sentry error it came from, with no name or address", async () => {
    const { deps, feedback } = harness();
    await sendProblemReport(
      form({
        message: "Student student@example.com saw code K7MQ2P and it broke",
        page: "/live/session-123?tab=results",
        reference: "1234567890",
        eventId: EVENT_ID,
      }),
      deps,
    );
    expect(feedback).toHaveBeenCalledOnce();
    const [payload] = feedback.mock.calls[0];
    expect(payload).toEqual({
      message: "Student [email] saw code [code] and it broke",
      url: "/live/[redacted]",
      associatedEventId: EVENT_ID,
    });
    expect(JSON.stringify(payload)).not.toMatch(/Pat|teacher@/);
  });

  it("sends feedback without an event id when the form did not come from an error", async () => {
    const { deps, feedback } = harness();
    await sendProblemReport(form(), deps);
    expect(feedback.mock.calls[0][0]).not.toHaveProperty("associatedEventId");
  });

  it("puts the error screen's reference and event id in the email", async () => {
    const { deps, mailer } = harness();
    await sendProblemReport(form({ reference: "1234567890", eventId: EVENT_ID }), deps);
    expect(mailer.sent()[0].text).toContain("Reference: 1234567890");
    expect(mailer.sent()[0].text).toContain(`Sentry event: ${EVENT_ID}`);
  });

  it("tags mail from staging", async () => {
    const { deps, mailer } = harness({ env: { VERCEL_ENV: "preview" } });
    await sendProblemReport(form(), deps);
    expect(mailer.sent()[0].subject).toMatch(/^\[staging\] Problem: /);
  });

  it("refuses someone signed out before reading or counting anything", async () => {
    const take = vi.fn();
    const { deps, mailer } = harness({
      viewer: async () => ({ status: "signed_out" }),
      limiter: { take } as unknown as ProblemReportLimiter,
    });
    expect(await sendProblemReport(form(), deps)).toEqual({ status: "signed_out" });
    expect(take).not.toHaveBeenCalled();
    expect(mailer.sent()).toHaveLength(0);
  });

  it("thanks a script that filled the hidden trap, and sends nothing", async () => {
    const { deps, mailer, feedback } = harness();
    const state = await sendProblemReport(form({ trap: "https://spam.example" }), deps);
    expect(state.status).toBe("sent");
    expect(mailer.sent()).toHaveLength(0);
    expect(feedback).not.toHaveBeenCalled();
  });

  it.each([
    ["too short", "  broken  ", PROBLEM_COPY.messageTooShort],
    ["too long", "x".repeat(2001), PROBLEM_COPY.messageTooLong],
  ])("asks for a message that is not %s, and counts nothing", async (_n, message, error) => {
    const store = createMemoryRateLimitStore();
    const { deps } = harness({ limiter: createProblemReportLimiter(store) });
    expect(await sendProblemReport(form({ message }), deps)).toEqual({ status: "invalid", error });
    expect(store.hits()).toHaveLength(0);
  });

  it.each([
    ["a page that is a whole URL", { page: "https://evil.example/" }],
    ["a page with a space", { page: "/a b" }],
    ["an event id that is not hex", { eventId: "not-an-event-id" }],
    ["a reference with markup", { reference: "<b>1</b>" }],
  ])("refuses %s as tampering, without saying which", async (_n, fields) => {
    const { deps, mailer } = harness();
    expect(await sendProblemReport(form(fields), deps)).toEqual({
      status: "error",
      error: PROBLEM_COPY.failed,
    });
    expect(mailer.sent()).toHaveLength(0);
  });

  it("refuses the sixth in an hour, pointing to the support address", async () => {
    const { deps, mailer } = harness();
    for (let i = 0; i < 5; i += 1) {
      await sendProblemReport(form(), { ...deps, newId: () => `id-${i}` });
    }
    expect(await sendProblemReport(form(), deps)).toEqual({
      status: "rate_limited",
      error: PROBLEM_COPY.rateLimited,
    });
    expect(mailer.sent()).toHaveLength(5);
  });

  it("fails closed when the limiter cannot answer", async () => {
    const { deps, mailer } = harness({ limiter: { take: async () => "unavailable" } });
    expect((await sendProblemReport(form(), deps)).status).toBe("error");
    expect(mailer.sent()).toHaveLength(0);
  });

  it("says it did not send when the mailer fails, logging no address, and sends no feedback", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: Mailer = {
      send: async () => {
        throw new EmailError("unavailable", "Resend answered 503.");
      },
    };
    const { deps, feedback } = harness({ mailer: () => failing });
    expect(await sendProblemReport(form(), deps)).toEqual({
      status: "error",
      error: PROBLEM_COPY.failed,
    });
    expect(feedback).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("teacher@");
  });
});
