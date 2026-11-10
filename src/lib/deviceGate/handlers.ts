import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_SECONDS,
  GATE_PAGE,
  INVITE_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  isGatedHost,
  readGateConfig,
  type GateEnv,
} from "./config";
import type { GateStore } from "./store";
import {
  constantTimeEqual,
  fromBase64Url,
  randomToken,
  sha256Hex,
  signToken,
  toBase64Url,
  verifyToken,
} from "./token";

/**
 * The device gate's API (ADR 0017), as plain functions of a Request so they can be tested without
 * Next. Every route answers 404 off the staging host, so production has no gate API at all, and
 * 503 on the staging host when the secret is missing.
 *
 * A device gets in one of two ways. Its first passkey is registered with the enrollment code
 * (DEVICE_GATE_ENROLL_CODE) or a one-time invite link made on a device already in. After that it
 * unlocks with the passkey. Either way it is given a signed session cookie for 30 days, and the
 * proxy checks the device is still registered on every request, so revoking one locks it at once.
 */

export interface GateHandlerDeps {
  readonly store: GateStore;
  readonly env?: GateEnv;
  readonly nowSeconds?: () => number;
  /** The WebAuthn library, replaceable in tests. */
  readonly webauthn?: WebAuthn;
}

export interface WebAuthn {
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
}

const defaultWebAuthn: WebAuthn = {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
};

const MAX_NAME_LENGTH = 60;

type Ready = {
  readonly secret: string;
  readonly enrollCode: string | null;
  readonly rpID: string;
  readonly origin: string;
  readonly now: number;
  readonly webauthn: WebAuthn;
  readonly store: GateStore;
};

function json(body: unknown, status = 200, cookies: readonly string[] = []): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

const refuse = (error: string, status: number) => json({ error }, status);

export function cookieHeader(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** The host check, the secret, and for anything that changes state, a same-origin request. */
function prepare(request: Request, deps: GateHandlerDeps): Ready | Response {
  if (!isGatedHost(request.headers.get("host"))) return new Response("Not Found", { status: 404 });
  const config = readGateConfig(deps.env);
  if (!config.ok) return refuse("misconfigured", 503);
  if (request.method !== "GET" && request.headers.get("origin") !== config.origin) {
    return refuse("origin", 403);
  }
  return {
    secret: config.secret,
    enrollCode: config.enrollCode,
    rpID: config.rpID,
    origin: config.origin,
    now: deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000),
    webauthn: deps.webauthn ?? defaultWebAuthn,
    store: deps.store,
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function sessionCookie(ready: Ready, deviceId: string): Promise<string> {
  const token = await signToken(
    { k: "session", d: deviceId, exp: ready.now + SESSION_TTL_SECONDS },
    ready.secret,
  );
  return cookieHeader(SESSION_COOKIE, token, SESSION_TTL_SECONDS);
}

const clearChallenge = () => cookieHeader(CHALLENGE_COOKIE, "", 0);

/** Runs a handler, turning a database failure into a 503 rather than a crash or a way in. */
async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch {
    return refuse("unavailable", 503);
  }
}

// ---------------------------------------------------------------------------
// Registering a device
// ---------------------------------------------------------------------------

export async function registerOptions(request: Request, deps: GateHandlerDeps): Promise<Response> {
  const ready = prepare(request, deps);
  if (ready instanceof Response) return ready;
  const body = await readBody(request);
  if (!body) return refuse("body", 400);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) return refuse("name", 400);

  return guarded(async () => {
    let inviteHash: string | undefined;
    if (typeof body.invite === "string" && body.invite) {
      inviteHash = await sha256Hex(body.invite);
      if (!(await ready.store.isInviteOpen(inviteHash))) return refuse("invite", 403);
    } else {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const allowed =
        ready.enrollCode !== null &&
        code !== "" &&
        (await constantTimeEqual(code, ready.enrollCode));
      if (!allowed) return refuse("code", 403);
    }

    const options = await ready.webauthn.generateRegistrationOptions({
      rpName: "LeaRN staging",
      rpID: ready.rpID,
      userName: name,
      userDisplayName: name,
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    const challenge = await signToken(
      {
        k: "challenge",
        purpose: "register",
        ch: options.challenge,
        name,
        ...(inviteHash ? { invite: inviteHash } : {}),
        exp: ready.now + CHALLENGE_TTL_SECONDS,
      },
      ready.secret,
    );
    return json({ options }, 200, [
      cookieHeader(CHALLENGE_COOKIE, challenge, CHALLENGE_TTL_SECONDS),
    ]);
  });
}

export async function registerVerify(request: Request, deps: GateHandlerDeps): Promise<Response> {
  const ready = prepare(request, deps);
  if (ready instanceof Response) return ready;
  const challenge = await verifyToken(
    readCookie(request, CHALLENGE_COOKIE),
    ready.secret,
    "challenge",
    ready.now,
  );
  if (!challenge || challenge.purpose !== "register" || !challenge.name) {
    return refuse("challenge", 400);
  }
  const body = await readBody(request);
  if (!body?.response || typeof body.response !== "object") return refuse("body", 400);

  let verification: Awaited<ReturnType<WebAuthn["verifyRegistrationResponse"]>>;
  try {
    verification = await ready.webauthn.verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: challenge.ch,
      expectedOrigin: ready.origin,
      expectedRPID: ready.rpID,
      requireUserVerification: false,
    });
  } catch {
    return refuse("passkey", 400);
  }
  if (!verification.verified) return refuse("passkey", 400);

  const { credential } = verification.registrationInfo;
  const deviceName = challenge.name;
  return guarded(async () => {
    const added = await ready.store.addDevice({
      name: deviceName,
      credentialId: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      inviteHash: challenge.invite ?? null,
    });
    if (!added.ok) return refuse("invite", 403);
    return json({ ok: true }, 200, [await sessionCookie(ready, added.id), clearChallenge()]);
  });
}

// ---------------------------------------------------------------------------
// Unlocking with a passkey already registered
// ---------------------------------------------------------------------------

export async function unlockOptions(request: Request, deps: GateHandlerDeps): Promise<Response> {
  const ready = prepare(request, deps);
  if (ready instanceof Response) return ready;
  // No allowCredentials: the browser offers whichever passkey this device holds for the host.
  const options = await ready.webauthn.generateAuthenticationOptions({
    rpID: ready.rpID,
    userVerification: "preferred",
  });
  const challenge = await signToken(
    {
      k: "challenge",
      purpose: "unlock",
      ch: options.challenge,
      exp: ready.now + CHALLENGE_TTL_SECONDS,
    },
    ready.secret,
  );
  return json({ options }, 200, [cookieHeader(CHALLENGE_COOKIE, challenge, CHALLENGE_TTL_SECONDS)]);
}

export async function unlockVerify(request: Request, deps: GateHandlerDeps): Promise<Response> {
  const ready = prepare(request, deps);
  if (ready instanceof Response) return ready;
  const challenge = await verifyToken(
    readCookie(request, CHALLENGE_COOKIE),
    ready.secret,
    "challenge",
    ready.now,
  );
  if (!challenge || challenge.purpose !== "unlock") return refuse("challenge", 400);
  const body = await readBody(request);
  const response = body?.response as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== "object" || typeof response.id !== "string") {
    return refuse("body", 400);
  }

  return guarded(async () => {
    const stored = await ready.store.credential(response.id);
    const publicKey = stored ? fromBase64Url(stored.publicKey) : null;
    if (!stored || !publicKey) return refuse("unknown", 403);

    let verification: Awaited<ReturnType<WebAuthn["verifyAuthenticationResponse"]>>;
    try {
      verification = await ready.webauthn.verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.ch,
        expectedOrigin: ready.origin,
        expectedRPID: ready.rpID,
        credential: {
          id: response.id,
          publicKey: publicKey as Uint8Array<ArrayBuffer>,
          counter: stored.counter,
          transports: [...stored.transports],
        },
        requireUserVerification: false,
      });
    } catch {
      return refuse("passkey", 400);
    }
    if (!verification.verified) return refuse("passkey", 400);
    if (
      !(await ready.store.recordUse(stored.deviceId, verification.authenticationInfo.newCounter))
    ) {
      return refuse("unknown", 403);
    }
    return json({ ok: true }, 200, [await sessionCookie(ready, stored.deviceId), clearChallenge()]);
  });
}

// ---------------------------------------------------------------------------
// Managing devices, from a device already in
// ---------------------------------------------------------------------------

async function currentDevice(request: Request, ready: Ready): Promise<string | null> {
  const session = await verifyToken(
    readCookie(request, SESSION_COOKIE),
    ready.secret,
    "session",
    ready.now,
  );
  if (!session) return null;
  return (await ready.store.isDeviceActive(session.d)) ? session.d : null;
}

/** GET: every device, and which one is asking. */
export async function listDevices(request: Request, deps: GateHandlerDeps): Promise<Response> {
  const ready = prepare(request, deps);
  if (ready instanceof Response) return ready;
  return guarded(async () => {
    const current = await currentDevice(request, ready);
    if (!current) return refuse("locked", 401);
    const devices = await ready.store.listDevices();
    return json({ devices, current });
  });
}

/**
 * POST: `{ action: "invite" }` makes a one-time link for another device, good for a day.
 * `{ action: "lock" }` forgets this device's session (the passkey stays registered).
 * `{ action: "revoke", id }` revokes a device; revoking this one also locks it.
 */
export async function manageDevices(request: Request, deps: GateHandlerDeps): Promise<Response> {
  const ready = prepare(request, deps);
  if (ready instanceof Response) return ready;
  const body = await readBody(request);
  if (!body) return refuse("body", 400);

  return guarded(async () => {
    const current = await currentDevice(request, ready);
    if (!current) return refuse("locked", 401);
    const lockCookie = cookieHeader(SESSION_COOKIE, "", 0);

    if (body.action === "invite") {
      const token = randomToken();
      const expiresAt = await ready.store.createInvite(
        await sha256Hex(token),
        current,
        INVITE_TTL_SECONDS,
      );
      const link = `${ready.origin}${GATE_PAGE}?invite=${encodeURIComponent(token)}`;
      return json({ link, expiresAt });
    }
    if (body.action === "lock") return json({ ok: true }, 200, [lockCookie]);
    if (body.action === "revoke" && typeof body.id === "string") {
      // The last device in cannot be revoked: with no enrollment code set, nothing could add
      // another one, and the way back would be SQL on the staging project.
      const target = body.id;
      const others = (await ready.store.listDevices()).filter(
        (device) => device.revokedAt === null && device.id !== target,
      );
      if (others.length === 0) return refuse("last", 409);
      const revoked = await ready.store.revokeDevice(target);
      return json({ revoked }, 200, target === current ? [lockCookie] : []);
    }
    return refuse("action", 400);
  });
}
