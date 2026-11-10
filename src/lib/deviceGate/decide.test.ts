import { describe, expect, it, vi } from "vitest";
import { STAGING_HOST, isGatedHost, normalizeHost, readGateConfig } from "./config";
import { decideGate, isOpenPath, type GateRequest } from "./decide";
import { needsSessionWork } from "./sessionPaths";
import { signToken } from "./token";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const env = { DEVICE_GATE_SECRET: SECRET };

const page = (pathname: string, extra: Partial<GateRequest> = {}): GateRequest => ({
  host: STAGING_HOST,
  pathname,
  search: "",
  method: "GET",
  accept: "text/html,application/xhtml+xml",
  isRsc: false,
  sessionToken: null,
  ...extra,
});

const session = (deviceId: string, exp = NOW + 60) =>
  signToken({ k: "session", d: deviceId, exp }, SECRET);

describe("config", () => {
  it("knows the staging host, with or without a port or capitals", () => {
    expect(normalizeHost("Staging.LearNursing.app:443")).toBe(STAGING_HOST);
    expect(isGatedHost("staging.learnursing.app.")).toBe(true);
    expect(isGatedHost(STAGING_HOST)).toBe(true);
    expect(isGatedHost("www.learnursing.app")).toBe(false);
    expect(isGatedHost("learn-abc-team.vercel.app")).toBe(false);
    expect(isGatedHost(null)).toBe(false);
  });

  it("needs a secret of 32 characters or more", () => {
    expect(readGateConfig({}).ok).toBe(false);
    expect(readGateConfig({ DEVICE_GATE_SECRET: "short" }).ok).toBe(false);
    expect(readGateConfig(env)).toEqual({
      ok: true,
      secret: SECRET,
      enrollCode: null,
      rpID: STAGING_HOST,
      origin: `https://${STAGING_HOST}`,
    });
  });

  it("takes an enrollment code only when it is long enough", () => {
    expect(readGateConfig({ ...env, DEVICE_GATE_ENROLL_CODE: "1234" }).ok).toBe(false);
    expect(readGateConfig({ ...env, DEVICE_GATE_ENROLL_CODE: "c".repeat(31) }).ok).toBe(false);
    const config = readGateConfig({ ...env, DEVICE_GATE_ENROLL_CODE: "c".repeat(32) });
    expect(config.ok && config.enrollCode).toBe("c".repeat(32));
  });
});

describe("open paths", () => {
  it("are the gate itself, health, Stripe's webhook, cron and robots.txt", () => {
    for (const path of [
      "/device-gate",
      "/api/device-gate/unlock/options",
      "/api/health",
      "/api/stripe/webhook",
      "/api/cron/assignment-reminders",
      "/robots.txt",
    ]) {
      expect(isOpenPath(path)).toBe(true);
    }
    for (const path of ["/", "/device-gate/devices", "/api/healthz", "/api/ai-import/start"]) {
      expect(isOpenPath(path)).toBe(false);
    }
  });
});

describe("decideGate", () => {
  const active = vi.fn(async () => true);

  it("does nothing off the staging host, even with no secret", async () => {
    const decision = await decideGate(page("/", { host: "www.learnursing.app" }), {
      env: {},
      isDeviceActive: active,
    });
    expect(decision).toEqual({ kind: "not-gated" });
  });

  it("refuses everything on the staging host without a secret", async () => {
    expect(await decideGate(page("/device-gate"), { env: {}, isDeviceActive: active })).toEqual({
      kind: "misconfigured",
    });
  });

  it("opens the gate's own paths without a device", async () => {
    expect(await decideGate(page("/device-gate"), { env, isDeviceActive: active })).toEqual({
      kind: "open",
    });
  });

  it("sends a page load to the gate with the way back, and the root to the bare gate", async () => {
    const deps = { env, isDeviceActive: active, nowSeconds: NOW };
    expect(await decideGate(page("/learn", { search: "?x=1" }), deps)).toEqual({
      kind: "redirect",
      location: `/device-gate?next=${encodeURIComponent("/learn?x=1")}`,
    });
    expect(await decideGate(page("/"), deps)).toEqual({
      kind: "redirect",
      location: "/device-gate",
    });
  });

  it("denies data requests, posts and API calls without a device", async () => {
    const deps = { env, isDeviceActive: active, nowSeconds: NOW };
    expect(await decideGate(page("/learn", { isRsc: true }), deps)).toEqual({ kind: "deny" });
    expect(await decideGate(page("/learn", { method: "POST" }), deps)).toEqual({ kind: "deny" });
    expect(await decideGate(page("/api/x", { accept: "application/json" }), deps)).toEqual({
      kind: "deny",
    });
    expect(await decideGate(page("/x", { accept: null }), deps)).toEqual({ kind: "deny" });
  });

  it("lets in an active device, and asks about that device", async () => {
    const isDeviceActive = vi.fn(async () => true);
    const decision = await decideGate(page("/learn", { sessionToken: await session("dev-9") }), {
      env,
      isDeviceActive,
      nowSeconds: NOW,
    });
    expect(decision).toEqual({ kind: "allowed", deviceId: "dev-9" });
    expect(isDeviceActive).toHaveBeenCalledWith("dev-9");
  });

  it("locks out a revoked device, an expired session, and a database that cannot answer", async () => {
    const base = { env, nowSeconds: NOW };
    const token = await session("dev-9");
    expect(
      await decideGate(page("/x", { sessionToken: token }), {
        ...base,
        isDeviceActive: async () => false,
      }),
    ).toMatchObject({ kind: "redirect" });
    expect(
      await decideGate(page("/x", { sessionToken: await session("dev-9", NOW - 1) }), {
        ...base,
        isDeviceActive: active,
      }),
    ).toMatchObject({ kind: "redirect" });
    expect(
      await decideGate(page("/x", { sessionToken: token }), {
        ...base,
        isDeviceActive: async () => {
          throw new Error("down");
        },
      }),
    ).toMatchObject({ kind: "redirect" });
  });
});

describe("needsSessionWork", () => {
  it("matches what the old matcher matched and nothing else", () => {
    for (const path of [
      "/",
      "/pricing",
      "/author",
      "/author/quizzes",
      "/learn",
      "/learn/practice",
      "/account",
      "/c/abc",
      "/w/token",
      "/b/token",
      "/sign-in",
      "/sign-up",
      "/welcome",
      "/auth/confirm",
      "/gallery",
      "/gallery/items/x",
    ]) {
      expect(needsSessionWork(path), path).toBe(true);
    }
    for (const path of [
      "/terms",
      "/privacy",
      "/device-gate",
      "/api/health",
      "/pricing/x",
      "/authors",
    ]) {
      expect(needsSessionWork(path), path).toBe(false);
    }
  });
});
