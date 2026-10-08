"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { SignUpState } from "@/components/auth/SignUpForm";
import { captchaTokenFrom, verifyCaptcha } from "@/lib/auth/captcha";
import { parseAccountName } from "@/lib/auth/displayName";
import { checkNewPassword, PASSWORD_WEAK } from "@/lib/auth/password";
import { parseSignInForm } from "@/lib/auth/signInForm";
import { takeSignInAddress } from "@/lib/auth/signInRateLimit";
import { afterSignUpPath, carriedClassCode, parseSignUpRole, signUp } from "@/lib/auth/signUp";
import { takeSignUpAttempt } from "@/lib/auth/signUpLimit";
import { SIGN_UP_CAPTCHA_ACTION } from "@/lib/auth/turnstile";
import { sendWelcomeEmail } from "@/lib/auth/welcomeEmail";
import { takeWelcomeEmail } from "@/lib/auth/welcomeLimit";
import { getMailer } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const ROLE_MISSING = "Choose whether you teach or are a student.";
const SIGN_UP_FAILED = "Your account could not be created just now. Try again in a moment.";

/**
 * The sign-up page's form (#361, ADR 0009): a role, a name, an email address and a password, and
 * the person has an account and is signed in.
 *
 * Nothing is made until the form has parsed, the sign-up limit has allowed the try
 * (`takeSignUpAttempt`) and the CAPTCHA has passed (`verifyCaptcha`), in that order, so a refused
 * caller costs no call to Cloudflare and a failed CAPTCHA still counts. Those two are what stand in
 * front of the one thing this form gives away: it says when an address already has an account.
 *
 * The role posted decides one thing, on the server: whether `signUp` calls `register_instructor`.
 * It is never written to the account. See `signUp` for the rest.
 *
 * The welcome email that confirms the address (#360) goes out in `after()`, through the app mailer,
 * and spends the recipient's email budget like any other link. A failed send never changes the
 * answer.
 */
export async function createAccount(
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const role = parseSignUpRole(formData.get("role"));
  if (!role) return { status: "error", error: ROLE_MISSING, field: "role" };
  const name = parseAccountName(formData.get("displayName"));
  if (!name.ok) return { status: "error", error: name.error, field: "displayName" };
  const parsed = parseSignInForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error, field: "email" };
  const password = checkNewPassword(formData.get("password"));
  if (!password.ok) return { status: "error", error: password.error, field: "password" };

  const requestHeaders = await headers();
  const allowed = await takeSignUpAttempt(requestHeaders, parsed.email);
  if (!allowed.ok) return { status: "error", error: allowed.error, field: "email" };
  const captcha = await verifyCaptcha(captchaTokenFrom(formData), requestHeaders, {
    action: SIGN_UP_CAPTCHA_ACTION,
  });
  if (!captcha.ok) return { status: "error", error: captcha.error, field: "captcha" };

  const service = createSupabaseServiceClient();
  const supabase = await createSupabaseServerClient();
  const result = await signUp(
    { email: parsed.email, password: password.password, displayName: name.name, role },
    {
      createUser: (params) => service.auth.admin.createUser(params),
      saveName: async (userId, displayName) =>
        await service.from("profiles").update({ display_name: displayName }).eq("id", userId),
      // The id is the one `createUser` returned, never one the request carried.
      registerInstructor: async (userId, workspace) =>
        await service.rpc("register_instructor", { p_user: userId, p_workspace: workspace }),
      signIn: (credentials) => supabase.auth.signInWithPassword(credentials),
    },
  );

  if (result.status === "exists") return { status: "exists", email: parsed.email };
  if (result.status === "weak") return { status: "error", error: PASSWORD_WEAK, field: "password" };
  if (result.status === "failed") return { status: "error", error: SIGN_UP_FAILED, field: "email" };

  if ((await takeSignInAddress(requestHeaders, parsed.email)) === "send") {
    after(() =>
      // No role yet means no class yet: the email says how to join one, not that they are in one.
      sendWelcomeEmail(
        { email: parsed.email },
        result.home === "teacher" ? "teacher" : "newcomer",
        {
          requestHeaders,
          generateLink: (params) => service.auth.admin.generateLink(params),
          mailer: getMailer(),
          allow: () => takeWelcomeEmail(),
        },
      ),
    );
  }

  const next = afterSignUpPath(result, carriedClassCode(formData.get("code")));
  if (!result.signedIn) return { status: "created_signed_out", next };
  redirect(next);
}
