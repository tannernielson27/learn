import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubString, scrubUrl } from "./scrub";

const EMAIL = "maria.lopez@students.example.edu";
// The shapes the app really uses: a 32-character base64url invite token (the check constraint in
// the classes migration) and a six-character join code from SESSION_CODE_ALPHABET.
const INVITE_TOKEN = "k3Jd9sQpX2mZ7vLwA8nB_4cR6tY1uE5h";
const JOIN_CODE = "QX7K2P";
const SESSION_ID = "8d0c2f5e-1b7a-4e0b-9f64-3c1d2a7b9e10";
const COOKIE = "sb-access-token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
const ANSWER_KEY = { correctOptionId: "opt-b" };
const RATIONALE = "Furosemide lowers potassium, so recheck the level first.";
const DISPLAY_NAME = "Maria L.";

/** Everything the issue says must not survive, in one event shaped the way Sentry builds them. */
function eventCarryingStudentData() {
  return {
    event_id: "abc123",
    level: "error",
    message: `Could not join ${JOIN_CODE} for ${EMAIL}`,
    transaction: "GET /c/[token]",
    user: { id: "user-1", email: EMAIL, username: DISPLAY_NAME, ip_address: "203.0.113.9" },
    request: {
      method: "POST",
      url: `https://learn.example.app/c/${INVITE_TOKEN}?next=%2Flearn&code=${JOIN_CODE}`,
      query_string: `code=${JOIN_CODE}`,
      cookies: { "sb-access-token": JWT },
      data: { email: EMAIL, answer: "opt-b" },
      headers: {
        cookie: COOKIE,
        authorization: `Bearer ${JWT}`,
        "x-forwarded-for": "203.0.113.9",
        "user-agent": "Mozilla/5.0 (iPhone)",
        "content-type": "application/json",
        referer: `https://learn.example.app/join/${JOIN_CODE}`,
      },
      env: { REMOTE_ADDR: "203.0.113.9" },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: `invite ${INVITE_TOKEN} for ${EMAIL} failed at /play/${SESSION_ID}`,
          stacktrace: {
            frames: [
              {
                filename: "app:///_next/server/app/c/[token]/page.js",
                function: "InvitePage",
                vars: { email: EMAIL, name: DISPLAY_NAME },
              },
            ],
          },
        },
      ],
    },
    extra: {
      joinCode: JOIN_CODE,
      inviteToken: INVITE_TOKEN,
      item: { id: "item-1", answerKey: ANSWER_KEY, rationale: RATIONALE, stem: "Which first?" },
      displayName: DISPLAY_NAME,
      responseBody: '{"score":1}',
    },
    contexts: {
      browser: { name: "Mobile Safari", version: "18" },
      os: { name: "iOS" },
      state: { participant: { display_name: DISPLAY_NAME, answer_key: ANSWER_KEY } },
    },
    tags: { route: `/join/${JOIN_CODE}` },
    breadcrumbs: [
      {
        category: "fetch",
        data: { method: "POST", url: `/api/live/submit?token=${INVITE_TOKEN}`, status_code: 500 },
      },
      { category: "navigation", data: { from: `/c/${INVITE_TOKEN}`, to: `/live/${SESSION_ID}` } },
      { category: "console", message: `signed in as ${EMAIL}`, data: { arguments: [EMAIL] } },
    ],
  };
}

describe("scrubEvent", () => {
  it("lets none of an email, an invite token, a join code, an answer key or a cookie through", () => {
    const scrubbed = JSON.stringify(scrubEvent(eventCarryingStudentData()));

    for (const secret of [
      EMAIL,
      INVITE_TOKEN,
      JOIN_CODE,
      SESSION_ID,
      JWT,
      "correctOptionId",
      "answerKey",
      "answer_key",
      "opt-b",
      RATIONALE,
      DISPLAY_NAME,
      "203.0.113.9",
      '{"score":1}',
    ]) {
      expect(scrubbed, `"${secret}" survived the scrub`).not.toContain(secret);
    }
  });

  it("is a real control: the unscrubbed event does carry every one of them", () => {
    const raw = JSON.stringify(eventCarryingStudentData());
    for (const secret of [EMAIL, INVITE_TOKEN, JOIN_CODE, JWT, "answerKey", RATIONALE]) {
      expect(raw).toContain(secret);
    }
  });

  it("keeps what is needed to debug: the error, the route shape and the device", () => {
    const scrubbed = scrubEvent(eventCarryingStudentData());

    expect(scrubbed.event_id).toBe("abc123");
    expect(scrubbed.transaction).toBe("GET /c/[token]");
    expect(scrubbed.exception.values[0].type).toBe("Error");
    expect(scrubbed.exception.values[0].value).toBe(
      "invite [token] for [email] failed at /play/[redacted]",
    );
    // Local variables are dropped whole: any key name can hold a student's data.
    expect(scrubbed.exception.values[0].stacktrace.frames[0]).toEqual({
      filename: "app:///_next/server/app/c/[token]/page.js",
      function: "InvitePage",
    });
    expect(scrubbed.message).toBe("Could not join [code] for [email]");
    expect(scrubbed.contexts.browser).toEqual({ name: "Mobile Safari", version: "18" });
    expect(scrubbed.extra.item).toEqual({ id: "item-1", stem: "Which first?" });
    expect(scrubbed.tags.route).toBe("/join/[redacted]");
  });

  it("drops the user entirely, so no one is identifiable", () => {
    expect(scrubEvent(eventCarryingStudentData())).not.toHaveProperty("user");
  });

  it("keeps only the method, a masked URL and harmless headers of the request", () => {
    expect(scrubEvent(eventCarryingStudentData()).request).toEqual({
      method: "POST",
      url: "https://learn.example.app/c/[redacted]",
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone)",
        "content-type": "application/json",
      },
    });
  });

  it("does not change the event it was given", () => {
    const event = eventCarryingStudentData();
    const before = JSON.stringify(event);
    scrubEvent(event);
    expect(JSON.stringify(event)).toBe(before);
  });

  it("handles an event with no request, user or extras", () => {
    expect(scrubEvent({ message: "plain" })).toEqual({ message: "plain" });
  });

  it("keeps a request with nothing but a method", () => {
    expect(scrubEvent({ request: { method: "GET" } })).toEqual({ request: { method: "GET" } });
  });

  it("scrubs transactions the same way, spans included", () => {
    const transaction = {
      type: "transaction",
      transaction: "GET /join/[code]",
      spans: [
        { description: `GET /join/${JOIN_CODE}`, data: { "url.full": `/c/${INVITE_TOKEN}` } },
      ],
    };
    const scrubbed = JSON.stringify(scrubEvent(transaction));
    expect(scrubbed).not.toContain(JOIN_CODE);
    expect(scrubbed).not.toContain(INVITE_TOKEN);
    expect(scrubbed).toContain("GET /join/[code]");
  });

  it("stops at a depth limit instead of walking forever", () => {
    type Nested = { next?: Nested; value?: string };
    let deep: Nested = { value: EMAIL };
    for (let i = 0; i < 100; i += 1) deep = { next: deep };
    expect(JSON.stringify(scrubEvent({ extra: deep }))).not.toContain(EMAIL);
  });

  it("leaves numbers, booleans and nulls as they are", () => {
    expect(scrubEvent({ extra: { n: 3, ok: true, none: null } })).toEqual({
      extra: { n: 3, ok: true, none: null },
    });
  });
});

describe("scrubString", () => {
  it.each([
    [`reach ${EMAIL} now`, "reach [email] now"],
    [`token ${JWT}`, "token [jwt]"],
    [`/c/${INVITE_TOKEN}`, "/c/[redacted]"],
    [`/join/${JOIN_CODE}`, "/join/[redacted]"],
    [`/live/${SESSION_ID}/report`, "/live/[redacted]/report"],
    [`/play/${SESSION_ID}`, "/play/[redacted]"],
    [
      `https://a.app/auth/confirm?token_hash=abc&type=email`,
      "https://a.app/auth/confirm?[filtered]",
    ],
    [`https://a.app/#access_token=${JWT}&type=magiclink`, "https://a.app/#[filtered]"],
    // Free text: a join code or an invite token said in a message, with no URL around it.
    [`no session for ${JOIN_CODE}`, "no session for [code]"],
    [`no session for code 2345AB.`, "no session for code [code]."],
    [`invite ${INVITE_TOKEN} was rotated`, "invite [token] was rotated"],
    // About one code in six has no digit at all: (24/32)^6.
    ["no session for BCDEFH", "no session for [code]"],
    // Percent-encoded links are decoded before the rules run.
    [`link https%3A%2F%2Fx.app%2Fc%2F${INVITE_TOKEN}`, "link https://x.app/c/[redacted]"],
    [`next=%2Fjoin%2F${JOIN_CODE}`, "next=/join/[redacted]"],
  ])("masks %s", (input, expected) => {
    expect(scrubString(input)).toBe(expected);
  });

  it.each([
    "app:///_next/static/chunks/app/play/[sessionId]/page-3f2a.js",
    "GET /c/[token]",
    "/api/live/submit",
    "/api/live/view",
    "Cannot read properties of null (reading 'position')",
    "/learn",
    "/c",
    // The few six-letter words an error message really uses are kept readable.
    "SELECT failed; UPDATE refused",
    "DELETE, CREATE, SCHEMA, HEADER, BEFORE, RETURN, NUMBER",
    // A malformed escape is left as it was rather than throwing.
    "100% of 50%zz",
    // Ids are how an error is traced to a row, and they are not secrets.
    `item ${SESSION_ID} not found`,
    "app:///_next/static/chunks/0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d.js",
  ])("leaves %s alone", (input) => {
    expect(scrubString(input)).toBe(input);
  });

  it("masks a token segment even inside a longer path", () => {
    expect(scrubString(`https://x.app/c/${INVITE_TOKEN}/accept`)).toBe(
      "https://x.app/c/[redacted]/accept",
    );
  });
});

describe("scrubUrl", () => {
  it("masks tokens in the path and drops the query and fragment whole", () => {
    expect(scrubUrl(`https://x.app/join/${JOIN_CODE}?utm=1#frag`)).toBe(
      "https://x.app/join/[redacted]",
    );
  });

  it("keeps a URL with nothing to hide", () => {
    expect(scrubUrl("https://x.app/learn")).toBe("https://x.app/learn");
  });
});

describe("scrubBreadcrumb", () => {
  it("masks URLs and drops logged arguments", () => {
    expect(
      scrubBreadcrumb({
        category: "console",
        message: `signed in as ${EMAIL}`,
        data: { arguments: [EMAIL], url: `/c/${INVITE_TOKEN}` },
      }),
    ).toEqual({
      category: "console",
      message: "signed in as [email]",
      data: { url: "/c/[redacted]" },
    });
  });
});
