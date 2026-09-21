import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_TOKEN_REFRESH_AHEAD_MS,
  createChannelTokenSource,
  type ChannelRefusal,
} from "./channelTokenSource";
import { LIVE_ROUTES } from "./wire";

const T0 = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function fetchAnswering(...answers: (Response | Error)[]) {
  return vi.fn<typeof globalThis.fetch>(async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error("no more answers scripted");
    if (next instanceof Error) throw next;
    return next;
  });
}

const fresh = (token: string, expiresAt: number) => Response.json({ token, expiresAt });
const refusal = (status: number, code: string) =>
  Response.json({ refusal: code, error: "..." }, { status });

/** A source whose token is already inside its refresh window, so every call asks the server. */
function due(fetch: typeof globalThis.fetch) {
  const source = createChannelTokenSource({
    initial: { token: "first", expiresAt: T0 },
    fetch,
    now: () => T0,
  });
  const refusals: ChannelRefusal[] = [];
  source.onRefused((why) => refusals.push(why));
  return { source, refusals };
}

describe("createChannelTokenSource", () => {
  it("answers with the server-rendered token while it has more than five minutes left", async () => {
    const fetch = fetchAnswering();
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 + HOUR },
      fetch,
      now: () => T0,
    });
    expect(await source.accessToken()).toBe("first");
    expect(await source.accessToken()).toBe("first");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the next token from the channel route, with the cookie, inside the last five minutes", async () => {
    let now = T0;
    const fetch = fetchAnswering(fresh("second", T0 + 2 * HOUR));
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 + HOUR },
      fetch,
      baseUrl: "http://live.test",
      now: () => now,
    });

    now = T0 + HOUR - CHANNEL_TOKEN_REFRESH_AHEAD_MS;
    expect(await source.accessToken()).toBe("second");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`http://live.test${LIVE_ROUTES.channel}`);
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });

    // And holds the new one: no second request while it is fresh.
    expect(await source.accessToken()).toBe("second");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers a phone that slept through its expiry on the first heartbeat after waking", async () => {
    const fetch = fetchAnswering(fresh("after-sleep", T0 + 3 * HOUR));
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 + HOUR },
      fetch,
      now: () => T0 + 2 * HOUR,
    });
    expect(await source.accessToken()).toBe("after-sleep");
  });

  it("shares one request between heartbeats that land together", async () => {
    const fetch = fetchAnswering(fresh("second", T0 + 2 * HOUR));
    const { source } = due(fetch);
    expect(
      await Promise.all([source.accessToken(), source.accessToken(), source.accessToken()]),
    ).toEqual(["second", "second", "second"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not wedge when fetch throws synchronously", async () => {
    let calls = 0;
    const fetch = vi.fn((() => {
      calls += 1;
      if (calls === 1) throw new Error("synchronous");
      return Promise.resolve(fresh("second", T0 + 2 * HOUR));
    }) as unknown as typeof globalThis.fetch);
    const { source } = due(fetch);
    expect(await source.accessToken()).toBe("first");
    expect(await source.accessToken()).toBe("second");
  });
});

describe("a failure the network caused: transient, retried", () => {
  it("holds the token and asks again after a 429, a 5xx, a broken body or no network", async () => {
    const fetch = fetchAnswering(
      refusal(429, "rate_limited"),
      Response.json({ error: "down" }, { status: 503 }),
      Response.json({ token: 42 }),
      new Error("offline"),
      fresh("finally", T0 + 2 * HOUR),
    );
    const { source, refusals } = due(fetch);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await source.accessToken()).toBe("first");
    }
    expect(await source.accessToken()).toBe("finally");
    expect(refusals).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("treats a 409 that is not an ended session as transient", async () => {
    const fetch = fetchAnswering(refusal(409, "paused"), fresh("second", T0 + 2 * HOUR));
    const { source, refusals } = due(fetch);
    expect(await source.accessToken()).toBe("first");
    expect(await source.accessToken()).toBe("second");
    expect(refusals).toEqual([]);
  });
});

describe("the server finishing with this phone: definitive, never retried", () => {
  it("says a 401 means the participant is gone, once, and stops asking", async () => {
    const fetch = fetchAnswering(Response.json({ error: "..." }, { status: 401 }));
    const { source, refusals } = due(fetch);

    expect(await source.accessToken()).toBe("first");
    expect(refusals).toEqual(["signed_out"]);

    // Every later heartbeat is answered without a request: asking again would get the same no.
    for (let beat = 0; beat < 10; beat += 1) await source.accessToken();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refusals).toEqual(["signed_out"]);
  });

  it("says `not_open` means the session has ended, and stops asking", async () => {
    const fetch = fetchAnswering(refusal(409, "not_open"));
    const { source, refusals } = due(fetch);

    await source.accessToken();
    await source.accessToken();
    await source.accessToken();
    expect(refusals).toEqual(["ended"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("lets a listener unsubscribe", async () => {
    const fetch = fetchAnswering(Response.json({}, { status: 401 }));
    const source = createChannelTokenSource({
      initial: { token: "first", expiresAt: T0 },
      fetch,
      now: () => T0,
    });
    const heard = vi.fn();
    source.onRefused(heard)();
    await source.accessToken();
    expect(heard).not.toHaveBeenCalled();
  });
});
