import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionQrCode } from "@/components/live/SessionQrCode";
import { Button } from "@/components/ui/Button";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { joinUrl } from "@/lib/live/routes";
import { formatSessionCode } from "@/lib/live/sessionCode";
import { siteOrigin } from "@/lib/http/siteOrigin";
import { readHostSession, type SessionStatus } from "@/lib/supabase/sessions";
import { endLiveSession } from "../actions";

export const metadata: Metadata = { title: "Live session" };

const STATUS_LABEL: Record<SessionStatus, string> = {
  lobby: "Waiting to start",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
};

export default async function LiveSessionPage({
  params,
  searchParams,
}: PageProps<"/live/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();

  const { supabase } = await requireAuthor(`/live/${sessionId}`);
  const session = await readHostSession(supabase, sessionId);
  if (!session) notFound();

  const failedToEnd = (await searchParams).ended !== undefined;
  const ended = session.status === "ended";
  // Built from the request the host made, so a preview deployment's own address ends up in the
  // picture without anything being configured.
  const studentUrl = joinUrl(siteOrigin(await headers()), session.code);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-2 text-sm text-ink-2">
        <Link href="/author" className="tap-target inline-flex items-center hover:text-ink-1">
          Back to banks
        </Link>
      </p>
      <h1 className="font-read text-3xl break-words text-ink-1">{session.title}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {STATUS_LABEL[session.status]} · {session.itemCount}{" "}
        {session.itemCount === 1 ? "item" : "items"}
      </p>

      <section
        aria-labelledby="code-heading"
        className="mt-8 rounded-sm border border-line bg-surface-1 px-4 py-6 text-center"
      >
        <h2 id="code-heading" className="text-sm font-medium tracking-wide text-ink-2 uppercase">
          Join code
        </h2>
        {ended ? (
          <>
            <p data-testid="join-code" className="mt-3 font-mono text-3xl text-ink-2 line-through">
              {formatSessionCode(session.code)}
            </p>
            <p className="mt-3 text-sm text-ink-2">
              This session has ended. The code no longer works, and an ended session cannot be
              reopened. Start a new one from the bank.
            </p>
          </>
        ) : (
          <>
            <p
              data-testid="join-code"
              className="mt-3 font-mono text-5xl tracking-[0.2em] text-ink-1"
            >
              {formatSessionCode(session.code)}
            </p>
            <SessionQrCode
              url={studentUrl}
              label="QR code that opens the join page for this session"
              className="mx-auto mt-6 block h-auto w-40 rounded-sm border border-line sm:w-48"
            />
            <p data-testid="join-url" className="mt-3 font-mono text-sm break-all text-ink-2">
              {studentUrl}
            </p>
            <p className="mt-3 text-sm text-ink-2">
              Students join with this code. It stops working the moment the session ends.
            </p>
          </>
        )}
      </section>

      {failedToEnd ? (
        <p role="alert" className="mt-6 text-sm text-incorrect">
          The session could not be ended. Try again.
        </p>
      ) : null}

      {ended ? null : (
        <form action={endLiveSession.bind(null, session.id)} className="mt-6">
          <Button type="submit" variant="secondary">
            End session
          </Button>
        </form>
      )}
    </main>
  );
}
