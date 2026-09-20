import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { formatSessionCode } from "@/lib/live/sessionCode";
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
