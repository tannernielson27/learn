import { WELCOME_PATH } from "./accountPaths";
import { EMAIL_UNCONFIRMED_KEY } from "./emailConfirmation";
import { DEFAULT_AFTER_SIGN_IN } from "./nextPath";

interface AuthFailure {
  code?: string;
  status?: number;
}

/** The first choice on /sign-up (#361, ADR 0009). */
export const SIGN_UP_ROLES = ["teacher", "student"] as const;
export type SignUpRole = (typeof SIGN_UP_ROLES)[number];

/** The role the form posted, or null. It decides one server call and is never stored. */
export function parseSignUpRole(value: unknown): SignUpRole | null {
  return SIGN_UP_ROLES.find((role) => role === value) ?? null;
}

/** `register_instructor` refuses a workspace name over 80 characters, counted as Postgres counts. */
const WORKSPACE_NAME_MAX_LENGTH = 80;
const WORKSPACE_SUFFIX = "’s workspace";

/**
 * A new teacher's workspace, named after them. A long name is cut so the whole still fits, and an
 * account nobody has named (the welcome page's retry) gets a plain one.
 */
export function workspaceName(displayName: string | null): string {
  const room = WORKSPACE_NAME_MAX_LENGTH - [...WORKSPACE_SUFFIX].length;
  const owner = [...(displayName ?? "").trim()].slice(0, room).join("").trimEnd();
  return owner ? `${owner}${WORKSPACE_SUFFIX}` : "My workspace";
}

const CLASS_CODE_SHAPE = /^[A-Za-z0-9-]{4,32}$/;

/**
 * The class code `/sign-up?code=` carries through to the welcome page, or null. Only its shape is
 * checked here, so that nothing odd rides along in a redirect; joining (#362) checks the code.
 */
export function carriedClassCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return CLASS_CODE_SHAPE.test(code) ? code : null;
}

export interface SignUpInput {
  email: string;
  /** Already checked by `checkNewPassword`. */
  password: string;
  /** Already cleaned by `displayNameRule`. */
  displayName: string;
  role: SignUpRole;
}

/** The calls `signUp` makes, injected so it can be tested. */
export interface SignUpDeps {
  /** The service role's `auth.admin.createUser`. */
  createUser(params: {
    email: string;
    password: string;
    email_confirm: true;
    app_metadata: { [EMAIL_UNCONFIRMED_KEY]: true };
  }): Promise<{ data?: { user: { id: string } | null } | null; error: AuthFailure | null }>;
  /** Writes `profiles.display_name` on the account just created, by the id `createUser` returned. */
  saveName(userId: string, displayName: string): Promise<{ error: unknown }>;
  /** `register_instructor` with the service role, for the id `createUser` returned. */
  registerInstructor(userId: string, workspace: string): Promise<{ error: unknown }>;
  /** `supabase.auth.signInWithPassword` on the cookie client, so the session lands here. */
  signIn(credentials: { email: string; password: string }): Promise<{ error: unknown }>;
}

/** Where a new account stands: a teacher with a workspace, or an account with no role yet. */
export interface SignUpOutcome {
  home: "teacher" | "no_role";
  /** A teacher whose workspace could not be made. The account is whole; they retry on /welcome. */
  workspaceFailed: boolean;
}

export type SignUpResult =
  | ({
      status: "created";
      /** False when the account was made but this browser could not be signed in to it. */
      signedIn: boolean;
    } & SignUpOutcome)
  /** The address has an account. Nothing was tried with the password typed. */
  | { status: "exists" }
  | { status: "weak" }
  | { status: "failed" };

/** GoTrue's answer to creating an address that already has an account. */
const EMAIL_EXISTS = "email_exists";
const WEAK_PASSWORD = "weak_password";

function log(step: string, error: unknown): void {
  const { code, status } = (error ?? {}) as AuthFailure;
  // Never the address or the name: who signed up is not the log's business.
  console.error(`[sign-up] ${step} failed`, { status, code });
}

/** Never throws: a name that could not be saved can be added on /account. */
async function saveName(userId: string, displayName: string, deps: SignUpDeps): Promise<void> {
  try {
    const saved = await deps.saveName(userId, displayName);
    if (saved.error) log("saving the new account's name", saved.error);
  } catch (error) {
    log("saving the new account's name", error);
  }
}

/** Whether the workspace was made. Never throws: the account stands either way. */
async function makeWorkspace(
  userId: string,
  displayName: string,
  deps: SignUpDeps,
): Promise<boolean> {
  try {
    const registered = await deps.registerInstructor(userId, workspaceName(displayName));
    if (!registered.error) return true;
    log("making the teacher's workspace", registered.error);
  } catch (error) {
    log("making the teacher's workspace", error);
  }
  return false;
}

/** Where a new account goes once it is signed in. */
export function afterSignUpPath(outcome: SignUpOutcome, classCode: string | null): string {
  if (outcome.home === "teacher") return DEFAULT_AFTER_SIGN_IN;
  if (outcome.workspaceFailed) return `${WELCOME_PATH}?teach=1`;
  return classCode ? `${WELCOME_PATH}?code=${encodeURIComponent(classCode)}` : WELCOME_PATH;
}

/**
 * Open sign-up (#361, ADR 0009): an account from a name, an email address and a password, signed
 * in at once with no email to wait for.
 *
 * The account is made as the class invite makes one (`signUpForInvite`): through the admin API,
 * confirmed as far as Supabase is concerned so a password can sign it in, and carrying
 * `learn_email_unconfirmed` until its owner opens the welcome email. Confirming never blocks.
 *
 * The role is never written on the account by anything the person can reach. A teacher becomes one
 * by this function's own call to `register_instructor`, for the id `createUser` has just returned,
 * which makes a workspace of their own. A student is made by joining a class, so here they get an
 * account with no role and go on to the welcome page. If the workspace cannot be made the account
 * is left whole and role-less, with no half-made org: `register_instructor` rolls back on refusal.
 *
 * Unlike the invite form, an address that already has an account is only told so: the password
 * typed is not tried against it. The caller puts the CAPTCHA and the sign-up limits in front.
 */
export async function signUp(input: SignUpInput, deps: SignUpDeps): Promise<SignUpResult> {
  const credentials = { email: input.email, password: input.password };
  try {
    const created = await deps.createUser({
      ...credentials,
      email_confirm: true,
      app_metadata: { [EMAIL_UNCONFIRMED_KEY]: true },
    });
    if (created.error) {
      if (created.error.code === EMAIL_EXISTS) return { status: "exists" };
      if (created.error.code === WEAK_PASSWORD) return { status: "weak" };
      log("creating the account", created.error);
      return { status: "failed" };
    }

    const userId = created.data?.user?.id;
    let workspace = false;
    if (userId) {
      await saveName(userId, input.displayName, deps);
      if (input.role === "teacher")
        workspace = await makeWorkspace(userId, input.displayName, deps);
    } else {
      log("reading the new account's id", null);
    }
    const outcome: SignUpOutcome = {
      home: workspace ? "teacher" : "no_role",
      workspaceFailed: input.role === "teacher" && !workspace,
    };

    const signedIn = await deps.signIn(credentials);
    if (signedIn.error) log("signing in to the new account", signedIn.error);
    return { status: "created", signedIn: !signedIn.error, ...outcome };
  } catch (error) {
    log("the sign-up", error);
    return { status: "failed" };
  }
}
