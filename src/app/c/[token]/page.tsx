import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { InviteEmailForm } from "@/components/classes/InviteEmailForm";
import { InviteUnavailable } from "@/components/classes/InviteUnavailable";
import { ALREADY_INSTRUCTOR, JoinClassButton } from "@/components/classes/JoinClassButton";
import { clientIp } from "@/lib/auth/signInRateLimit";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { readViewer } from "@/lib/classes/viewer";
import { myClasses, resolveClassInvite } from "@/lib/supabase/classInvites";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { joinInvitedClass, requestInviteLink } from "./actions";

export const metadata: Metadata = {
  title: "Join a class",
  // The token is the whole secret: no Referer carries it off the page, and nothing indexes it.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const linkClass =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-16 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">LeaRN</p>
        {children}
      </div>
    </main>
  );
}

const LIMITED =
  "Too many invite links tried from this network. Wait a few minutes, then open the link again.";
const UNAVAILABLE = "Joining is not working just now. Reload the page in a moment.";

/**
 * A class invite link, `/c/<token>` (#205). The token is resolved on the server, counting a wrong
 * one against the caller's address; an unknown, rotated and malformed token all render the same
 * page. Then it depends on who is looking: a visitor gets the email form, a student or an account
 * with no role gets one tap to join, and an instructor is told they already are one.
 */
export default async function ClassInvitePage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const invite = await resolveClassInvite(
    createSupabaseServiceClient(),
    token,
    clientIp(await headers()),
  );

  if (invite.status !== "open") {
    return (
      <Shell>
        {invite.status === "invalid" ? (
          <InviteUnavailable />
        ) : (
          <p role="alert" className="text-ink-1">
            {invite.status === "rate_limited" ? LIMITED : UNAVAILABLE}
          </p>
        )}
      </Shell>
    );
  }

  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    return (
      <Shell>
        <InviteEmailForm
          action={requestInviteLink.bind(null, token)}
          classTitle={invite.className}
        />
      </Shell>
    );
  }

  if (viewer.role === "instructor" || viewer.role === "admin") {
    return (
      <Shell>
        <h1 className="mb-3 font-read text-3xl text-ink-1">{invite.className}</h1>
        <p className="mb-6 text-ink-1">{ALREADY_INSTRUCTOR}</p>
        <Link href="/author" className={linkClass}>
          Go to your item banks
        </Link>
      </Shell>
    );
  }

  const joined = (await myClasses(viewer.supabase)) ?? [];
  if (joined.some((entry) => entry.id === invite.classId)) {
    return (
      <Shell>
        <h1 className="mb-3 font-read text-3xl text-ink-1">{invite.className}</h1>
        <p className="mb-6 text-ink-1">You are in this class.</p>
        <Link href={STUDENT_HOME} className={linkClass}>
          Go to your classes
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <JoinClassButton
        action={joinInvitedClass.bind(null, token)}
        classTitle={invite.className}
        email={viewer.email}
      />
    </Shell>
  );
}
