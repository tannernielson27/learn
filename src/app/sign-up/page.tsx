import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { signedInHome } from "@/lib/auth/landing";
import { carriedClassCode, parseSignUpRole } from "@/lib/auth/signUp";
import { captchaSiteKey } from "@/lib/auth/turnstile";
import { readViewer } from "@/lib/classes/viewer";
import { createAccount } from "./actions";

export const metadata: Metadata = { title: "Create an account" };

/**
 * Open sign-up (#361, ADR 0009). `?role=teacher|student` starts on that choice, and `?code=` is a
 * class code carried through for a student. Someone already signed in has no use for this page
 * and is sent to their own home.
 */
export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const viewer = await readViewer();
  if (viewer.status === "signed_in") redirect(signedInHome(viewer.role));

  const params = await searchParams;
  const classCode = carriedClassCode(params.code);
  // A link that carries a class code is a student's link.
  const initialRole = parseSignUpRole(params.role) ?? (classCode ? "student" : null);

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        <h1 className="mb-6 font-read text-3xl text-ink-1">Create an account</h1>
        <SignUpForm
          action={createAccount}
          initialRole={initialRole}
          classCode={classCode}
          captchaSiteKey={captchaSiteKey()}
        />
        <p className="mt-6 text-sm text-ink-2">
          Have an account?{" "}
          <Link
            href="/sign-in"
            className="tap-target inline-flex items-center font-medium text-accent-ink hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
