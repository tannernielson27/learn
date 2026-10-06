import { STUDENT_HOME } from "@/lib/classes/classes";
import type { JoinAnswer } from "@/lib/supabase/classInvites";
import { EMAIL_UNCONFIRMED_KEY } from "./emailConfirmation";

interface AuthFailure {
  code?: string;
  status?: number;
}

export interface InviteSignUpInput {
  email: string;
  /** Already checked by `checkNewPassword`. */
  password: string;
  /** Only ever a class id the server has just resolved from the token. */
  classId: string;
}

/** The calls `signUpForInvite` makes, injected so it can be tested. */
export interface InviteSignUpDeps {
  /** The service role's `auth.admin.createUser`. */
  createUser(params: {
    email: string;
    password: string;
    email_confirm: true;
    app_metadata: { learn_invite: { class_id: string }; [EMAIL_UNCONFIRMED_KEY]: true };
  }): Promise<{ error: AuthFailure | null }>;
  /** `supabase.auth.signInWithPassword` on the cookie client, so the session lands here. */
  signIn(credentials: { email: string; password: string }): Promise<{ error: unknown }>;
  /** `joinClass` as the account that has just signed in. */
  join(): Promise<JoinAnswer>;
}

export type InviteSignUpResult =
  /** A new account, signed in and already in the class. */
  | { status: "created" }
  /** The account was made but could not be signed in here; its password works on the sign-in page. */
  | { status: "created_signed_out" }
  /** An existing account, signed in with its own password, and whether the class took it. */
  | { status: "signed_in"; joined: boolean }
  /** The address has an account and this is not its password. */
  | { status: "exists" }
  | { status: "weak" }
  | { status: "failed" };

/** GoTrue's answer to creating an address that already has an account. */
const EMAIL_EXISTS = "email_exists";
const WEAK_PASSWORD = "weak_password";

function log(step: string, error: unknown): void {
  const { code, status } = (error ?? {}) as AuthFailure;
  // Never the address: which addresses were invited is not the log's business.
  console.error(`[invite] ${step} failed`, { status, code });
}

/**
 * Joins a class with an email address and a password, in one step and with no email to wait for.
 *
 * A new address gets an account at once: `app_metadata.learn_invite` makes it a student in the
 * class (`private.handle_user_invite`), and `learn_email_unconfirmed` records that nobody has yet
 * shown the address is theirs. It is created confirmed as far as Supabase is concerned, because
 * that is what lets a password sign it in; the confirmation email follows and never blocks.
 *
 * An address that already has an account is never changed here. The password typed is tried as
 * that account's own, and if it fits, the person is signed in and joined, so one form serves the
 * new student and the returning one. If it does not fit, the answer says the address has an
 * account. That is the one place LeaRN says so (#139 otherwise), and it is behind a class's
 * invite link and the invite and password limits: without it, a returning student could not tell
 * a wrong password from a failed sign-up.
 */
export async function signUpForInvite(
  input: InviteSignUpInput,
  deps: InviteSignUpDeps,
): Promise<InviteSignUpResult> {
  const credentials = { email: input.email, password: input.password };
  try {
    const created = await deps.createUser({
      ...credentials,
      email_confirm: true,
      app_metadata: { learn_invite: { class_id: input.classId }, [EMAIL_UNCONFIRMED_KEY]: true },
    });

    if (!created.error) {
      const signedIn = await deps.signIn(credentials);
      if (!signedIn.error) return { status: "created" };
      log("signing in to the new account", signedIn.error);
      return { status: "created_signed_out" };
    }
    if (created.error.code === WEAK_PASSWORD) return { status: "weak" };
    if (created.error.code !== EMAIL_EXISTS) {
      log("creating the account", created.error);
      return { status: "failed" };
    }

    const signedIn = await deps.signIn(credentials);
    if (signedIn.error) return { status: "exists" };
    return { status: "signed_in", joined: (await deps.join()) === "joined" };
  } catch (error) {
    log("the sign-up", error);
    return { status: "failed" };
  }
}

/** The service role's `auth.signInWithOtp`, never creating an account. */
export type SendLink = (params: {
  email: string;
  redirectTo: string;
}) => Promise<{ error: AuthFailure | null }>;

/**
 * Emails the link that confirms a new account's address. It is the ordinary sign-in link: opening
 * it is what shows the address is theirs (`markEmailConfirmed`). Runs after the response, so it
 * never throws and never delays anyone.
 */
export async function sendConfirmationLink(
  email: string,
  origin: string,
  sendLink: SendLink,
): Promise<void> {
  try {
    const confirmUrl = new URL("/auth/confirm", origin);
    confirmUrl.searchParams.set("next", STUDENT_HOME);
    const sent = await sendLink({ email, redirectTo: confirmUrl.toString() });
    if (sent.error) log("sending the confirmation link", sent.error);
  } catch (error) {
    log("the confirmation link", error);
  }
}
