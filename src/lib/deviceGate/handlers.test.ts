import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHALLENGE_COOKIE, SESSION_COOKIE, STAGING_HOST } from "./config";
import {
  listDevices,
  manageDevices,
  readCookie,
  registerOptions,
  registerVerify,
  unlockOptions,
  unlockVerify,
  type GateHandlerDeps,
  type WebAuthn,
} from "./handlers";
import type { GateStore } from "./store";
import { sha256Hex, signToken, verifyToken } from "./token";

const SECRET = "s".repeat(40);
const CODE = "c".repeat(32);
const NOW = 1_800_000_000;
const ORIGIN = `https://${STAGING_HOST}`;

function fakeStore(overrides: Partial<GateStore> = {}): GateStore {
  return {
    addDevice: vi.fn(async () => ({ ok: true as const, id: "dev-new" })),
    credential: vi.fn(async () => ({
      deviceId: "dev-1",
      publicKey: "cHVibGljS2V5MDAwMDAwMDA",
      counter: 3,
      transports: ["internal"],
    })),
    recordUse: vi.fn(async () => true),
    isDeviceActive: vi.fn(async () => true),
    listDevices: vi.fn(async () => [
      { id: "dev-1", name: "Laptop", createdAt: "t", lastUsedAt: null, revokedAt: null },
      { id: "dev-2", name: "Phone", createdAt: "t", lastUsedAt: null, revokedAt: null },
    ]),
    revokeDevice: vi.fn(async () => true),
    createInvite: vi.fn(async () => "2027-01-01T00:00:00Z"),
    isInviteOpen: vi.fn(async () => true),
    ...overrides,
  };
}

function fakeWebAuthn(overrides: Partial<WebAuthn> = {}): WebAuthn {
  return {
    generateRegistrationOptions: vi.fn(async () => ({ challenge: "reg-challenge" })) as never,
    verifyRegistrationResponse: vi.fn(async () => ({
      verified: true,
      registrationInfo: {
        credential: {
          id: "credentialId00000001",
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          transports: ["hybrid"],
        },
      },
    })) as never,
    generateAuthenticationOptions: vi.fn(async () => ({ challenge: "unlock-challenge" })) as never,
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified: true,
      authenticationInfo: { newCounter: 4 },
    })) as never,
    ...overrides,
  };
}

let store: GateStore;
let webauthn: WebAuthn;
let deps: GateHandlerDeps;

beforeEach(() => {
  store = fakeStore();
  webauthn = fakeWebAuthn();
  deps = {
    store,
    webauthn,
    env: { DEVICE_GATE_SECRET: SECRET, DEVICE_GATE_ENROLL_CODE: CODE },
    nowSeconds: () => NOW,
  };
});

function post(
  path: string,
  body: unknown,
  init: { cookie?: string; origin?: string; host?: string } = {},
) {
  const headers = new Headers({
    host: init.host ?? STAGING_HOST,
    origin: init.origin ?? ORIGIN,
    "content-type": "application/json",
  });
  if (init.cookie) headers.set("cookie", init.cookie);
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function cookiesOf(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    out[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return out;
}

const challengeCookie = (payload: Parameters<typeof signToken>[0]) =>
  signToken(payload, SECRET).then((token) => `${CHALLENGE_COOKIE}=${token}`);

describe("every route", () => {
  it("does not exist off the staging host", async () => {
    const response = await registerOptions(post("/x", {}, { host: "www.learnursing.app" }), deps);
    expect(response.status).toBe(404);
  });

  it("refuses with 503 when the secret is missing", async () => {
    const response = await unlockOptions(post("/x", {}), { ...deps, env: {} });
    expect(response.status).toBe(503);
  });

  it("refuses a post from another origin", async () => {
    const response = await unlockOptions(post("/x", {}, { origin: "https://evil.example" }), deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin" });
  });
});

describe("registering with the enrollment code", () => {
  it("hands out options and a signed challenge for the right code", async () => {
    const response = await registerOptions(post("/x", { name: " Laptop ", code: CODE }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ options: { challenge: "reg-challenge" } });
    const challenge = await verifyToken(
      cookiesOf(response)[CHALLENGE_COOKIE],
      SECRET,
      "challenge",
      NOW,
    );
    expect(challenge).toMatchObject({ purpose: "register", ch: "reg-challenge", name: "Laptop" });
    expect(challenge).not.toHaveProperty("invite");
  });

  it("refuses a wrong or missing code, and every code when none is set", async () => {
    for (const body of [{ name: "L", code: "wrong" }, { name: "L" }]) {
      const response = await registerOptions(post("/x", body), deps);
      expect(response.status).toBe(403);
    }
    const noCode = await registerOptions(post("/x", { name: "L", code: CODE }), {
      ...deps,
      env: { DEVICE_GATE_SECRET: SECRET },
    });
    expect(noCode.status).toBe(403);
  });

  it("refuses a blank or long name and a body that is not JSON", async () => {
    expect((await registerOptions(post("/x", { name: " ", code: CODE }), deps)).status).toBe(400);
    expect(
      (await registerOptions(post("/x", { name: "x".repeat(61), code: CODE }), deps)).status,
    ).toBe(400);
    const notJson = new Request(`${ORIGIN}/x`, {
      method: "POST",
      headers: { host: STAGING_HOST, origin: ORIGIN },
      body: "nope",
    });
    expect((await registerOptions(notJson, deps)).status).toBe(400);
  });

  it("stores the passkey and lets the device in", async () => {
    const cookie = await challengeCookie({
      k: "challenge",
      purpose: "register",
      ch: "reg-challenge",
      name: "Laptop",
      exp: NOW + 60,
    });
    const response = await registerVerify(post("/x", { response: { id: "r" } }, { cookie }), deps);
    expect(response.status).toBe(200);
    expect(store.addDevice).toHaveBeenCalledWith({
      name: "Laptop",
      credentialId: "credentialId00000001",
      publicKey: "AQIDBA",
      counter: 0,
      transports: ["hybrid"],
      inviteHash: null,
    });
    expect(webauthn.verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "reg-challenge",
        expectedOrigin: ORIGIN,
        expectedRPID: STAGING_HOST,
      }),
    );
    const cookies = cookiesOf(response);
    expect(await verifyToken(cookies[SESSION_COOKIE], SECRET, "session", NOW)).toMatchObject({
      d: "dev-new",
    });
    expect(cookies[CHALLENGE_COOKIE]).toBe("");
  });

  it("refuses with no challenge, an unlock challenge, or a passkey that does not verify", async () => {
    expect((await registerVerify(post("/x", { response: {} }), deps)).status).toBe(400);

    const unlock = await challengeCookie({
      k: "challenge",
      purpose: "unlock",
      ch: "c",
      exp: NOW + 60,
    });
    expect(
      (await registerVerify(post("/x", { response: {} }, { cookie: unlock }), deps)).status,
    ).toBe(400);

    const cookie = await challengeCookie({
      k: "challenge",
      purpose: "register",
      ch: "c",
      name: "L",
      exp: NOW + 60,
    });
    expect((await registerVerify(post("/x", {}, { cookie }), deps)).status).toBe(400);
    const failing = fakeWebAuthn({
      verifyRegistrationResponse: vi.fn(async () => ({ verified: false })) as never,
    });
    expect(
      (
        await registerVerify(post("/x", { response: {} }, { cookie }), {
          ...deps,
          webauthn: failing,
        })
      ).status,
    ).toBe(400);
    const throwing = fakeWebAuthn({
      verifyRegistrationResponse: vi.fn(async () => {
        throw new Error("bad attestation");
      }) as never,
    });
    expect(
      (
        await registerVerify(post("/x", { response: {} }, { cookie }), {
          ...deps,
          webauthn: throwing,
        })
      ).status,
    ).toBe(400);
    expect(store.addDevice).not.toHaveBeenCalled();
  });
});

describe("registering with an invite link", () => {
  it("needs no code, and carries the invite to the verify step", async () => {
    const response = await registerOptions(post("/x", { name: "Phone", invite: "tok" }), deps);
    expect(response.status).toBe(200);
    const hash = await sha256Hex("tok");
    expect(store.isInviteOpen).toHaveBeenCalledWith(hash);
    const challenge = await verifyToken(
      cookiesOf(response)[CHALLENGE_COOKIE],
      SECRET,
      "challenge",
      NOW,
    );
    expect(challenge).toMatchObject({ invite: hash });

    const cookie = `${CHALLENGE_COOKIE}=${cookiesOf(response)[CHALLENGE_COOKIE]}`;
    await registerVerify(post("/x", { response: {} }, { cookie }), deps);
    expect(store.addDevice).toHaveBeenCalledWith(expect.objectContaining({ inviteHash: hash }));
  });

  it("refuses a used invite, at either step", async () => {
    const closed = { ...deps, store: fakeStore({ isInviteOpen: vi.fn(async () => false) }) };
    expect((await registerOptions(post("/x", { name: "P", invite: "tok" }), closed)).status).toBe(
      403,
    );

    const raced = {
      ...deps,
      store: fakeStore({
        addDevice: vi.fn(async () => ({ ok: false as const, reason: "invite_invalid" as const })),
      }),
    };
    const cookie = await challengeCookie({
      k: "challenge",
      purpose: "register",
      ch: "c",
      name: "P",
      invite: "h",
      exp: NOW + 60,
    });
    const response = await registerVerify(post("/x", { response: {} }, { cookie }), raced);
    expect(response.status).toBe(403);
    expect(cookiesOf(response)[SESSION_COOKIE]).toBeUndefined();
  });

  it("answers 503 when the database cannot be reached", async () => {
    const down = {
      ...deps,
      store: fakeStore({
        isInviteOpen: vi.fn(async () => {
          throw new Error("down");
        }),
      }),
    };
    expect((await registerOptions(post("/x", { name: "P", invite: "tok" }), down)).status).toBe(
      503,
    );
  });
});

describe("unlocking", () => {
  it("hands out options for any passkey this device holds", async () => {
    const response = await unlockOptions(post("/x", {}), deps);
    expect(response.status).toBe(200);
    expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith({
      rpID: STAGING_HOST,
      userVerification: "preferred",
    });
    expect(
      await verifyToken(cookiesOf(response)[CHALLENGE_COOKIE], SECRET, "challenge", NOW),
    ).toMatchObject({
      purpose: "unlock",
      ch: "unlock-challenge",
    });
  });

  it("checks the passkey against the stored key, records the use and lets the device in", async () => {
    const cookie = await challengeCookie({
      k: "challenge",
      purpose: "unlock",
      ch: "u",
      exp: NOW + 60,
    });
    const response = await unlockVerify(
      post("/x", { response: { id: "cred-1" } }, { cookie }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(store.credential).toHaveBeenCalledWith("cred-1");
    expect(webauthn.verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "u",
        credential: expect.objectContaining({ id: "cred-1", counter: 3, transports: ["internal"] }),
      }),
    );
    expect(store.recordUse).toHaveBeenCalledWith("dev-1", 4);
    expect(
      await verifyToken(cookiesOf(response)[SESSION_COOKIE], SECRET, "session", NOW),
    ).toMatchObject({ d: "dev-1" });
  });

  it("refuses an unknown or revoked passkey, a failed check, and a register challenge", async () => {
    const cookie = await challengeCookie({
      k: "challenge",
      purpose: "unlock",
      ch: "u",
      exp: NOW + 60,
    });
    const body = { response: { id: "cred-1" } };

    const unknown = { ...deps, store: fakeStore({ credential: vi.fn(async () => null) }) };
    expect((await unlockVerify(post("/x", body, { cookie }), unknown)).status).toBe(403);

    const failing = fakeWebAuthn({
      verifyAuthenticationResponse: vi.fn(async () => ({ verified: false })) as never,
    });
    expect(
      (await unlockVerify(post("/x", body, { cookie }), { ...deps, webauthn: failing })).status,
    ).toBe(400);

    const throwing = fakeWebAuthn({
      verifyAuthenticationResponse: vi.fn(async () => {
        throw new Error("bad signature");
      }) as never,
    });
    expect(
      (await unlockVerify(post("/x", body, { cookie }), { ...deps, webauthn: throwing })).status,
    ).toBe(400);

    const revokedMidway = { ...deps, store: fakeStore({ recordUse: vi.fn(async () => false) }) };
    expect((await unlockVerify(post("/x", body, { cookie }), revokedMidway)).status).toBe(403);

    expect((await unlockVerify(post("/x", { response: {} }, { cookie }), deps)).status).toBe(400);
    const register = await challengeCookie({
      k: "challenge",
      purpose: "register",
      ch: "u",
      name: "x",
      exp: NOW + 60,
    });
    expect((await unlockVerify(post("/x", body, { cookie: register }), deps)).status).toBe(400);
  });
});

describe("managing devices", () => {
  const signedIn = async () =>
    `${SESSION_COOKIE}=${await signToken({ k: "session", d: "dev-1", exp: NOW + 60 }, SECRET)}`;

  it("lists devices for a device that is in, and refuses one that is not", async () => {
    const get = (cookie?: string) =>
      new Request(`${ORIGIN}/api/device-gate/devices`, {
        headers: { host: STAGING_HOST, ...(cookie ? { cookie } : {}) },
      });
    const response = await listDevices(get(await signedIn()), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      current: "dev-1",
      devices: [{ id: "dev-1" }, { id: "dev-2" }],
    });

    expect((await listDevices(get(), deps)).status).toBe(401);
    const revoked = { ...deps, store: fakeStore({ isDeviceActive: vi.fn(async () => false) }) };
    expect((await listDevices(get(await signedIn()), revoked)).status).toBe(401);
  });

  it("makes a one-day invite link and stores only its hash", async () => {
    const response = await manageDevices(
      post("/x", { action: "invite" }, { cookie: await signedIn() }),
      deps,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { link: string; expiresAt: string };
    const token = new URL(body.link).searchParams.get("invite") ?? "";
    expect(body.link.startsWith(`${ORIGIN}/device-gate?invite=`)).toBe(true);
    expect(store.createInvite).toHaveBeenCalledWith(await sha256Hex(token), "dev-1", 86400);
  });

  it("revokes a device, and locks this one when it revokes itself", async () => {
    const cookie = await signedIn();
    const other = await manageDevices(
      post("/x", { action: "revoke", id: "dev-2" }, { cookie }),
      deps,
    );
    expect(await other.json()).toEqual({ revoked: true });
    expect(cookiesOf(other)[SESSION_COOKIE]).toBeUndefined();

    const self = await manageDevices(
      post("/x", { action: "revoke", id: "dev-1" }, { cookie }),
      deps,
    );
    expect(cookiesOf(self)[SESSION_COOKIE]).toBe("");
  });

  it("refuses to revoke the last device that can open staging", async () => {
    const alone = {
      ...deps,
      store: fakeStore({
        listDevices: vi.fn(async () => [
          { id: "dev-1", name: "Laptop", createdAt: "t", lastUsedAt: null, revokedAt: null },
          { id: "dev-0", name: "Old", createdAt: "t", lastUsedAt: null, revokedAt: "r" },
        ]),
      }),
    };
    const response = await manageDevices(
      post("/x", { action: "revoke", id: "dev-1" }, { cookie: await signedIn() }),
      alone,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "last" });
    expect(alone.store.revokeDevice).not.toHaveBeenCalled();
  });

  it("locks this device, and refuses an unknown action or a device that is not in", async () => {
    const cookie = await signedIn();
    const lock = await manageDevices(post("/x", { action: "lock" }, { cookie }), deps);
    expect(cookiesOf(lock)[SESSION_COOKIE]).toBe("");
    expect((await manageDevices(post("/x", { action: "nope" }, { cookie }), deps)).status).toBe(
      400,
    );
    expect((await manageDevices(post("/x", { action: "invite" }), deps)).status).toBe(401);
  });
});

describe("readCookie", () => {
  it("finds a cookie among others, and nothing when it is absent", () => {
    const request = new Request(ORIGIN, { headers: { cookie: "a=1; __Host-x=two=parts; b" } });
    expect(readCookie(request, "__Host-x")).toBe("two=parts");
    expect(readCookie(request, "missing")).toBeNull();
  });
});
