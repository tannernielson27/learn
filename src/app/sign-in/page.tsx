import type { Metadata } from "next";
import { DemoSignIn } from "@/components/auth/DemoSignIn";
import { SignInForm } from "@/components/auth/SignInForm";
import { readDemoAccount } from "@/lib/auth/demoAccount";
import { safeNextPath } from "@/lib/auth/nextPath";
import { requestSignInLink, signInAsDemo } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        <h1 className="mb-6 font-read text-3xl text-ink-1">Sign in</h1>
        <SignInForm action={requestSignInLink} next={next} linkError={params.error === "link"} />
        {readDemoAccount() ? <DemoSignIn action={signInAsDemo} next={next} /> : null}
      </div>
    </main>
  );
}
