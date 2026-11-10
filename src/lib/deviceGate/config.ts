/**
 * The staging device gate (ADR 0017). staging.learnursing.app is open only to devices that have
 * registered a passkey. The gate is keyed to the host name, not to an environment variable, so a
 * missing variable can never switch it off: on the staging host with no secret, every request is
 * refused (`misconfigured`), and on any other host the gate does nothing at all.
 *
 * The host is also written into the proxy's matcher (src/proxy.ts), which must be a literal. Keep
 * the two the same.
 */
export const STAGING_HOST = "staging.learnursing.app";

/** The signed device session. `__Host-` pins it to this host, Secure, Path=/, with no Domain. */
export const SESSION_COOKIE = "__Host-learn-device";
/** The signed passkey challenge between the options call and the verify call. */
export const CHALLENGE_COOKIE = "__Host-learn-device-challenge";

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const INVITE_TTL_SECONDS = 24 * 60 * 60;

/** The page a locked-out visitor is sent to, and the API under it. */
export const GATE_PAGE = "/device-gate";
/** The gate's own API, each route by name, so a route added later is not open by default. */
export const GATE_API_PATHS = [
  "/api/device-gate/register/options",
  "/api/device-gate/register/verify",
  "/api/device-gate/unlock/options",
  "/api/device-gate/unlock/verify",
  "/api/device-gate/devices",
] as const;

const MIN_SECRET_LENGTH = 32;
const MIN_ENROLL_CODE_LENGTH = 32;

/** The environment the gate reads: DEVICE_GATE_SECRET and DEVICE_GATE_ENROLL_CODE. */
export type GateEnv = Readonly<Record<string, string | undefined>>;

export type GateConfig =
  | {
      readonly ok: true;
      readonly secret: string;
      /** Absent when no enrollment code is set: new devices then need an invite link. */
      readonly enrollCode: string | null;
      readonly rpID: string;
      readonly origin: string;
    }
  | { readonly ok: false; readonly reason: string };

/** The host a request was made to, lower-cased, without a port or a trailing dot. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isGatedHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === STAGING_HOST;
}

/**
 * Reads the gate's secrets. The secret signs every cookie, so a short one is refused rather than
 * used. The enrollment code is optional; when it is set, it must be long enough that guessing it
 * is not a plan, because nothing rate-limits the attempts.
 */
export function readGateConfig(env: GateEnv = process.env): GateConfig {
  const secret = env.DEVICE_GATE_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      reason: `DEVICE_GATE_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`,
    };
  }
  const code = env.DEVICE_GATE_ENROLL_CODE?.trim() ?? "";
  if (code && code.length < MIN_ENROLL_CODE_LENGTH) {
    return {
      ok: false,
      reason: `DEVICE_GATE_ENROLL_CODE must be at least ${MIN_ENROLL_CODE_LENGTH} characters, or unset`,
    };
  }
  return {
    ok: true,
    secret,
    enrollCode: code || null,
    rpID: STAGING_HOST,
    origin: `https://${STAGING_HOST}`,
  };
}
