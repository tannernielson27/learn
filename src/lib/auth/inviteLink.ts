import { invitePath, STUDENT_HOME } from "@/lib/classes/classes";

interface AuthFailure {
  code?: string;
  status?: number;
}

/**
 * The two admin calls this needs, injected so it can be tested. In the app they are the service
 * role's `auth.admin.createUser` and `auth.signInWithOtp` (see app/c/[token]/actions.ts).
 */
export interface InviteLinkDeps {
  createUser(params: {
    email: string;
    email_confirm: true;
    app_metadata: { learn_invite: { class_id: string } };
  }): Promise<{ error: AuthFailure | null }>;
  sendLink(params: { email: string; redirectTo: string }): Promise<{ error: AuthFailure | null }>;
}

export interface InviteLinkInput {
  email: string;
  /** Only ever a class id the server has just resolved from the token. */
  classId: string;
  token: string;
  origin: string;
}

/** GoTrue's answer to creating an address that already has an account. */
const EMAIL_EXISTS = "email_exists";

function logFailure(step: string, error: unknown): void {
  const { code, status } = (error ?? {}) as AuthFailure;
  // Never the address: which addresses were invited is not the log's business.
  console.error(`[invite] ${step} failed`, { status, code });
}

/**
 * Creates the account for a class invite if the address has none, then emails the sign-in link.
 * The only path in the app that creates an account (#205); plain sign-in keeps
 * `shouldCreateUser: false`.
 *
 * A new account gets `app_metadata.learn_invite`, which the database reads to make it a student in
 * the class (`private.handle_user_invite`). It is created confirmed: the emailed link is still what
 * signs anyone in, so a mistyped address is an account nobody can open, and the roster says it
 * has not signed in yet.
 *
 * An address that already has an account is left exactly as it is, never given the invite in
 * app_metadata, so nothing here can change an existing account's role. Its link returns to the
 * invite page, where a student joins with one tap and an instructor is told they already are one.
 *
 * Runs after the response has been sent (`after()`), so how long any of this takes says nothing
 * to the person who asked. It therefore never throws: every failure is logged, status and code
 * only.
 */
export async function sendInviteLink(input: InviteLinkInput, deps: InviteLinkDeps): Promise<void> {
  try {
    const created = await deps.createUser({
      email: input.email,
      email_confirm: true,
      app_metadata: { learn_invite: { class_id: input.classId } },
    });
    const isNew = !created.error;
    if (created.error && created.error.code !== EMAIL_EXISTS) {
      logFailure("creating the account", created.error);
      return;
    }

    const confirmUrl = new URL("/auth/confirm", input.origin);
    confirmUrl.searchParams.set("next", isNew ? STUDENT_HOME : invitePath(input.token));
    const sent = await deps.sendLink({ email: input.email, redirectTo: confirmUrl.toString() });
    if (sent.error) logFailure("sending the link", sent.error);
  } catch (error) {
    logFailure("the invite", error);
  }
}
