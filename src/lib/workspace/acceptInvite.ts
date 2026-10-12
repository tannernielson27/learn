import {
  afterConfirming,
  endEarlierAccess,
  type EndEarlierAccessDeps,
} from "@/lib/auth/emailConfirmation";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/auth/nextPath";
import type { AcceptOrgInviteResult } from "@/lib/supabase/orgInvites";
import { mustEndEarlierAccess } from "./invite";

interface AuthFailure {
  code?: string;
  status?: number;
}

function log(step: string, error: unknown): void {
  const { code, status } = (error ?? {}) as AuthFailure;
  // Never the token, an address, a name or an error's message, which could quote any of them.
  console.error(`[workspace-invite] ${step} failed`, {
    status,
    code,
    error: error instanceof Error ? error.name : undefined,
  });
}

export interface AcceptAsSignedInInput {
  /** The account `auth.getUser()` has just verified. Never an id from the request. */
  userId: string;
  /** `learn_email_unconfirmed` on that account as stored, read before anything is changed. */
  wasUnconfirmed: boolean;
  /** The verified claims of the session that is accepting, for when it was made. */
  claims: { amr?: unknown } | null | undefined;
  /** `resolve_org_invite`'s `expires_at`. */
  inviteExpiresAt: string;
  /**
   * True when this accept is a confirmed move out of another workspace. The account's other
   * sessions are then signed out even where nothing else of its earlier access is ended.
   */
  move?: boolean;
}

/** The calls `acceptAsSignedIn` makes, injected so it can be tested. */
export interface AcceptAsSignedInDeps {
  /** `accept_org_invite` with the service role, for the id given. */
  accept(userId: string): Promise<AcceptOrgInviteResult>;
  /** Removes `learn_email_unconfirmed` with the service role, as `markEmailConfirmed` does. */
  clearUnconfirmed(userId: string): Promise<{ error: unknown }>;
  /** `supabase.auth.refreshSession()` on the cookie client, so the session sees the new role. */
  refresh(): Promise<{ error: unknown }>;
  /** `earlierAccessDeps(supabase)`: the same two calls #378 makes, on the cookie client. */
  earlierAccess: EndEarlierAccessDeps;
}

export type AcceptOutcome =
  | { result: Exclude<AcceptOrgInviteResult, "accepted"> }
  | {
      result: "accepted";
      /** Where to send the new teacher: authoring, or first to choose a password of their own. */
      next: string;
      /** Whether the account's earlier password and sessions were ended. */
      endedEarlierAccess: boolean;
    };

/**
 * Accepts an invitation for an account that already existed and is signed in here.
 *
 * Nothing but `accepted` changes anything: on every other answer the account's metadata, session,
 * password and other sessions are exactly as they were.
 *
 * On `accepted`, three things follow, in the order #378 does them:
 *
 * 1. The invitation reached the invited inbox and nowhere else, so accepting it is the proof the
 *    address is theirs: `learn_email_unconfirmed` is cleared.
 * 2. The session is refreshed, so it stops carrying that key and sees the role it now has.
 * 3. Open sign-up lets anyone make an account, with a password, on an address that is not theirs.
 *    If that address is later invited, whoever made the account must not be left holding a teacher
 *    account. So unless this browser was plainly the account's own before the invitation existed
 *    (`mustEndEarlierAccess`), the password the account had is replaced with one nobody knows and
 *    every other session is signed out, exactly as `endEarlierAccess` does for an emailed link
 *    opened elsewhere, and the person goes to choose a password of their own.
 *
 * A fourth thing follows a move (ADR 0011). The account's other sessions may hold a Realtime
 * socket joined to a live session of the workspace it has just left, and such a socket is not
 * asked again who it is until its token is replaced. So every session but this one is signed out,
 * with the session's own call as in step 3 and never the admin API, which would end this one too.
 * The password is left alone unless step 3 applies as well.
 *
 * Never throws. A step after `accepted` that fails is logged and the rest still run: the person is
 * a teacher either way, and a failure here must not leave them on a page that says otherwise.
 */
export async function acceptAsSignedIn(
  input: AcceptAsSignedInInput,
  deps: AcceptAsSignedInDeps,
): Promise<AcceptOutcome> {
  let result: AcceptOrgInviteResult;
  try {
    result = await deps.accept(input.userId);
  } catch (error) {
    log("accepting an invitation", error);
    return { result: "unavailable" };
  }
  if (result !== "accepted") return { result };

  if (input.wasUnconfirmed) {
    try {
      const cleared = await deps.clearUnconfirmed(input.userId);
      if (cleared.error) log("marking an invited address confirmed", cleared.error);
    } catch (error) {
      log("marking an invited address confirmed", error);
    }
  }
  try {
    const refreshed = await deps.refresh();
    if (refreshed.error) log("refreshing the session after accepting", refreshed.error);
  } catch (error) {
    log("refreshing the session after accepting", error);
  }

  if (!mustEndEarlierAccess(input)) {
    if (input.move) {
      try {
        const others = await deps.earlierAccess.signOutOthers();
        if (others.error) log("signing out a moved teacher's other sessions", others.error);
      } catch (error) {
        log("signing out a moved teacher's other sessions", error);
      }
    }
    return { result, next: DEFAULT_AFTER_SIGN_IN, endedEarlierAccess: false };
  }
  // `null` for "signed in before": whoever held this account before is not taken on trust.
  const confirmed = { userId: input.userId };
  await endEarlierAccess(confirmed, null, deps.earlierAccess);
  return {
    result,
    next: afterConfirming(confirmed, null, DEFAULT_AFTER_SIGN_IN),
    endedEarlierAccess: true,
  };
}

export interface CreateAndAcceptInput {
  /** The invited address, from `resolve_org_invite`. Never one the form posted. */
  email: string;
  /** Already checked by `checkNewPassword`. */
  password: string;
  /** Already cleaned by `parseAccountName`. */
  displayName: string;
}

/** The calls `createAndAccept` makes, injected so it can be tested. */
export interface CreateAndAcceptDeps {
  /** The service role's `auth.admin.createUser`. */
  createUser(params: {
    email: string;
    password: string;
    email_confirm: true;
  }): Promise<{ data?: { user: { id: string } | null } | null; error: AuthFailure | null }>;
  /** Writes `profiles.display_name` on the account just created, by the id `createUser` returned. */
  saveName(userId: string, displayName: string): Promise<{ error: unknown }>;
  /** `accept_org_invite` with the service role, for the id `createUser` returned. */
  accept(userId: string): Promise<AcceptOrgInviteResult>;
  /** `supabase.auth.signInWithPassword` on the cookie client, so the session lands here. */
  signIn(credentials: { email: string; password: string }): Promise<{ error: unknown }>;
}

export type CreateAndAcceptResult =
  /** The address has an account. Nothing was tried with the password typed. */
  | { status: "exists" }
  | { status: "weak" }
  | { status: "failed" }
  | {
      status: "created";
      /** What `accept_org_invite` answered for the new account. */
      result: AcceptOrgInviteResult;
      /** False when the account was made but this browser could not be signed in to it. */
      signedIn: boolean;
    };

const EMAIL_EXISTS = "email_exists";
const WEAK_PASSWORD = "weak_password";

/**
 * The invitation page for someone with no account: makes one on the invited address, accepts the
 * invitation for it, and signs this browser in.
 *
 * The account is made as sign-up makes one (`signUp`), through the admin API and confirmed so a
 * password can sign it in, with one difference: it does not carry `learn_email_unconfirmed`. The
 * link went to that address and nowhere else, so holding it is the proof sign-up has to wait for.
 * Nothing existed before, so there is no earlier access to end.
 *
 * An address that already has an account is only told so, as on sign-up; the password typed is not
 * tried against it. The caller sends that person to sign in and come back.
 */
export async function createAndAccept(
  input: CreateAndAcceptInput,
  deps: CreateAndAcceptDeps,
): Promise<CreateAndAcceptResult> {
  const credentials = { email: input.email, password: input.password };
  try {
    const created = await deps.createUser({ ...credentials, email_confirm: true });
    if (created.error) {
      if (created.error.code === EMAIL_EXISTS) return { status: "exists" };
      if (created.error.code === WEAK_PASSWORD) return { status: "weak" };
      log("creating the invited account", created.error);
      return { status: "failed" };
    }

    const userId = created.data?.user?.id;
    let result: AcceptOrgInviteResult = "unavailable";
    if (userId) {
      try {
        const saved = await deps.saveName(userId, input.displayName);
        if (saved.error) log("saving the invited account's name", saved.error);
      } catch (error) {
        log("saving the invited account's name", error);
      }
      try {
        result = await deps.accept(userId);
      } catch (error) {
        log("accepting an invitation for a new account", error);
      }
    } else {
      log("reading the invited account's id", null);
    }

    const signedIn = await deps.signIn(credentials);
    if (signedIn.error) log("signing in to the invited account", signedIn.error);
    return { status: "created", result, signedIn: !signedIn.error };
  } catch (error) {
    log("making an account for an invitation", error);
    return { status: "failed" };
  }
}
