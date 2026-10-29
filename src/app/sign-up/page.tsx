import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { signedInHome } from "@/lib/auth/landing";
import { carriedClassCode, carriedNext, parseSignUpRole } from "@/lib/auth/signUp";
import { captchaSiteKey } from "@/lib/auth/turnstile";
import { readViewer } from "@/lib/classes/viewer";
import { PRICING_PATH } from "@/lib/site/links";
import { createAccount } from "./actions";
import { AuthFrame, AUTH_HEADING_ALONE } from "@/components/auth/AuthFrame";
import { SiteFooter } from "@/components/site/SiteFooter";
import { textLinkClasses } from "@/components/ui/TextLink";

export const metadata: Metadata = { title: "Create an account" };

/**
 * Open sign-up (#361, ADR 0009). `?role=teacher|student` starts on that choice, `?code=` is a
 * class code carried through for a student, and `?next=` is where a new teacher goes afterwards
 * (`carriedNext`), with sign-in carrying it too. Someone already signed in has no use for this page
 * and is sent to their own home.
 */
export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const viewer = await readViewer();
  if (viewer.status === "signed_in") redirect(signedInHome(viewer.role));

  const params = await searchParams;
  const classCode = carriedClassCode(params.code);
  // A link that carries a class code is a student's link.
  const initialRole = parseSignUpRole(params.role) ?? (classCode ? "student" : null);
  const next = carriedNext(params.next);
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";

  return (
    <>
      <AuthFrame>
        <h1 className={AUTH_HEADING_ALONE}>Create an account</h1>
        <SignUpForm
          action={createAccount}
          initialRole={initialRole}
          classCode={classCode}
          next={next}
          signInHref={signInHref}
          captchaSiteKey={captchaSiteKey()}
        />
        <p className="mt-6 text-sm text-ink-2">
          Have an account?{" "}
          <Link href={signInHref} className={textLinkClasses({ size: "sm" })}>
            Sign in
          </Link>
        </p>
        {/* #522: a teacher deciding whether to sign up can see the price first. */}
        <p className="mt-2 text-sm text-ink-2">
          <Link href={PRICING_PATH} className={textLinkClasses({ size: "sm" })}>
            See pricing
          </Link>
        </p>
      </AuthFrame>
      <SiteFooter />
    </>
  );
}
