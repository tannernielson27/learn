import {
  GATE_API_PATHS,
  GATE_PAGE,
  SESSION_COOKIE,
  isGatedHost,
  readGateConfig,
  type GateEnv,
} from "./config";
import { verifyToken } from "./token";

/**
 * What the proxy does with one request (ADR 0017):
 * - `not-gated`: any host but staging. The proxy carries on exactly as it did before the gate.
 * - `open`: the gate page, its API, and the few routes a machine calls with its own secret.
 * - `allowed`: a signed session for a device that is still registered and not revoked.
 * - `redirect`: a person's page load with no session, sent to the gate page.
 * - `deny`: anything else with no session (data requests, posts, API calls). A 401, no body.
 * - `misconfigured`: the staging host without a usable secret. A 503 for every request.
 */
export type GateDecision =
  | { readonly kind: "not-gated" }
  | { readonly kind: "open" }
  | { readonly kind: "allowed"; readonly deviceId: string }
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "deny" }
  | { readonly kind: "misconfigured" };

export interface GateRequest {
  readonly host: string | null;
  readonly pathname: string;
  readonly search: string;
  readonly method: string;
  /** The request's Accept header. */
  readonly accept: string | null;
  /** True for a React Server Components fetch (the `rsc` header), which is data, not a page. */
  readonly isRsc: boolean;
  readonly sessionToken: string | null;
}

export interface GateDeps {
  readonly env?: GateEnv;
  /** Whether a device id is registered and not revoked. Throws when it cannot be told. */
  readonly isDeviceActive: (deviceId: string) => Promise<boolean>;
  readonly nowSeconds?: number;
}

/**
 * Paths reachable on the staging host without a device:
 * - the gate page and its API, which is how a device gets in;
 * - /api/health, which the release workflow reads (it says which commit and project, no secrets);
 * - the Stripe webhook, which Stripe signs, and the cron routes, which check CRON_SECRET;
 * - robots.txt, which says not to index anything.
 */
export function isOpenPath(pathname: string): boolean {
  return (
    pathname === GATE_PAGE ||
    (GATE_API_PATHS as readonly string[]).includes(pathname) ||
    pathname === "/api/health" ||
    pathname === "/api/stripe/webhook" ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/robots.txt"
  );
}

function isPageLoad(request: GateRequest): boolean {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  if (request.isRsc) return false;
  return (request.accept ?? "").includes("text/html");
}

function locked(request: GateRequest): GateDecision {
  if (!isPageLoad(request)) return { kind: "deny" };
  const next = `${request.pathname}${request.search}`;
  const location = next === "/" ? GATE_PAGE : `${GATE_PAGE}?next=${encodeURIComponent(next)}`;
  return { kind: "redirect", location };
}

export async function decideGate(request: GateRequest, deps: GateDeps): Promise<GateDecision> {
  if (!isGatedHost(request.host)) return { kind: "not-gated" };
  const config = readGateConfig(deps.env);
  if (!config.ok) return { kind: "misconfigured" };
  if (isOpenPath(request.pathname)) return { kind: "open" };

  const session = await verifyToken(
    request.sessionToken,
    config.secret,
    "session",
    deps.nowSeconds,
  );
  if (!session) return locked(request);

  let active: boolean;
  try {
    active = await deps.isDeviceActive(session.d);
  } catch {
    // Fail closed: a database that cannot answer does not let anyone in.
    active = false;
  }
  return active ? { kind: "allowed", deviceId: session.d } : locked(request);
}

export { SESSION_COOKIE };
