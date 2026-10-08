import { STUDENT_HOME } from "@/lib/classes/classes";
import type { Mailer } from "@/lib/email";
import { renderWelcomeEmail, type WelcomeRole } from "@/lib/email/templates/welcome";
import {
  canonicalSiteOrigin,
  type DeploymentEnv,
  type RequestHeaders,
} from "@/lib/http/siteOrigin";
import { WELCOME_PATH } from "./accountPaths";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "./nextPath";

export type { WelcomeRole } from "@/lib/email/templates/welcome";

interface AuthFailure {
  code?: string;
  status?: number;
}

/** What `sendWelcomeEmail` needs, injected so it can be tested. */
export interface WelcomeEmailDeps {
  /** The request the account was made or the resend asked from; only its origin is used. */
  requestHeaders: RequestHeaders;
  /** For tests; defaults to the deployment's own variables. */
  env?: DeploymentEnv;
  /**
   * The service role's `auth.admin.generateLink`. It makes the link's token and sends nothing;
   * the token never leaves this module except inside the email.
   */
  generateLink(params: { type: "magiclink"; email: string }): Promise<{
    data: {
      properties?: { hashed_token?: string | null } | null;
      user?: { id?: string | null } | null;
    } | null;
    error: AuthFailure | null;
  }>;
  /** `getMailer()`. */
  mailer: Mailer;
  /**
   * `takeWelcomeEmail`: the deployment-wide ceiling, asked before any token is made. The caller's
   * own per-caller and per-address limits come before this and are the caller's to check.
   */
  allow(): Promise<boolean>;
  /** For tests; defaults to a random UUID. */
  nonce?: () => string;
}

/**
 * Which welcome an account gets, from the role on its own profile row: a teacher's for an
 * instructor or an admin, a student's for a student, and for an account with no role the one that
 * claims neither a class nor a workspace.
 */
export function welcomeRoleFor(role: "instructor" | "admin" | "student" | null): WelcomeRole {
  if (role === "instructor" || role === "admin") return "teacher";
  return role === "student" ? "student" : "newcomer";
}

/** Where confirming lands each role: the home it would reach after signing in. */
const HOME: Record<WelcomeRole, string> = {
  student: STUDENT_HOME,
  teacher: DEFAULT_AFTER_SIGN_IN,
  newcomer: WELCOME_PATH,
};

/**
 * The confirm link: `/auth/confirm` on `origin`, which renders the Continue button (#305), with a
 * `next` that `safeNextPath` lets through. The token hash is the admin API's, used the same way the
 * sign-in email's is.
 */
export function welcomeLink(origin: string, role: WelcomeRole, tokenHash: string): string {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", safeNextPath(HOME[role]));
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "email");
  return url.toString();
}

function log(step: string, error: unknown): void {
  // Never the address or the token, and never an error's message, which could carry either.
  const { code, status, kind, name } = (error ?? {}) as AuthFailure & {
    kind?: string;
    name?: string;
  };
  console.error(`[welcome] ${step} failed`, { name, kind, status, code });
}

/**
 * Emails a new account "welcome, confirm your address" (#360), through the app mailer rather than
 * a Supabase Auth template. Opening its link is what confirms the address (`markEmailConfirmed`).
 *
 * Used by the invite's password sign-up, after the response, and by the confirm banner's resend.
 * Only call it for an address that already has an account: the caller is what decides whose
 * address this is, and counts it against the sign-in email limits first.
 *
 * Never throws and never blocks a sign-up (owner decision 2026-10-06): any failure is logged and
 * answered false, and the banner still offers to send it again.
 */
export async function sendWelcomeEmail(
  user: { email: string },
  role: WelcomeRole,
  deps: WelcomeEmailDeps,
): Promise<boolean> {
  try {
    const origin = canonicalSiteOrigin(deps.requestHeaders, deps.env);
    // Refused or unanswered: already logged there, and nothing to make a token for.
    if (!(await deps.allow())) return false;
    const generated = await deps.generateLink({ type: "magiclink", email: user.email });
    if (generated.error) {
      log("making the confirm link", generated.error);
      return false;
    }
    const tokenHash = generated.data?.properties?.hashed_token;
    const userId = generated.data?.user?.id;
    if (!tokenHash || !userId) {
      log("making the confirm link", { code: "no_token" });
      return false;
    }

    const email = renderWelcomeEmail(role, welcomeLink(origin, role, tokenHash));
    const nonce = deps.nonce?.() ?? crypto.randomUUID();
    await deps.mailer.send({
      to: user.email,
      ...email,
      // From what it is about, never the address. Fresh each time, so a resend is not a repeat.
      idempotencyKey: `welcome:${userId}:${nonce}`,
    });
    return true;
  } catch (error) {
    log("sending the welcome email", error);
    return false;
  }
}
