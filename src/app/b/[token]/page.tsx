import type { Metadata } from "next";
import { AuthFrame, AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { AcceptAccessForm } from "@/components/freeAccess/AcceptAccessForm";
import { UnusableLink } from "@/components/freeAccess/UnusableLink";
import { TextLink } from "@/components/ui/TextLink";
import {
  BETA_PASS_HEADING,
  BETA_PASS_LINE,
  BETA_PASS_SIGNED_OUT,
  BETA_PASS_TITLE,
  BETA_PASS_UNUSABLE,
  signInToRedeemPath,
  signUpToRedeemPath,
} from "@/lib/betaPass/link";
import { readViewer } from "@/lib/classes/viewer";
import { acceptFreeAccess } from "./actions";

export const metadata: Metadata = {
  title: BETA_PASS_TITLE,
  // The token is the whole secret: no Referer carries it off the page, and nothing indexes it.
  // The proxy sends the same policy as a header on every answer under /b/.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Rendered for each request and never stored: the answer depends on who asks.
export const dynamic = "force-dynamic";

/**
 * A beta pass, `/b/<token>` (#520, ADR 0016): a link the owner sends one tester by hand. Nothing
 * links here.
 *
 * Opening it changes nothing and looks nothing up, so the page reads the same for every token,
 * real or not. What it offers depends only on who is looking: a visitor signs in or makes a
 * teacher account and comes back here; a teacher gets one button; anyone else gets the one
 * neutral sentence. Pressing the button asks the database, which redeems the pass for this
 * teacher's workspace or refuses, and every refusal reads as that same sentence.
 */
export default async function FreeAccessPage({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const viewer = await readViewer();

  if (viewer.status === "signed_out") {
    return (
      <AuthFrame>
        <section aria-labelledby="free-access-signed-out">
          <h1 id="free-access-signed-out" className={AUTH_HEADING}>
            {BETA_PASS_HEADING}
          </h1>
          <p className={AUTH_SUBLINE}>{BETA_PASS_SIGNED_OUT}</p>
          <p className="flex flex-wrap gap-x-6">
            <TextLink href={signInToRedeemPath(token)}>Sign in</TextLink>
            <TextLink href={signUpToRedeemPath(token)}>Create a teacher account</TextLink>
          </p>
        </section>
      </AuthFrame>
    );
  }

  if (viewer.role !== "instructor" && viewer.role !== "admin") {
    return (
      <AuthFrame>
        <UnusableLink sentence={BETA_PASS_UNUSABLE} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AcceptAccessForm
        action={acceptFreeAccess.bind(null, token)}
        heading={BETA_PASS_HEADING}
        line={BETA_PASS_LINE}
        unusable={BETA_PASS_UNUSABLE}
        email={viewer.email}
      />
    </AuthFrame>
  );
}
