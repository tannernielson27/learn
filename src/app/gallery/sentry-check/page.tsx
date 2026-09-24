import { ThrowButton } from "./throw-button";

/**
 * The owner's check that a preview reports to Sentry (#235, docs/05 §7.9). Not in the gallery nav:
 * it is opened by URL, and it is closed on production with the rest of `/gallery`.
 */
export default function SentryCheckPage() {
  return (
    <article className="max-w-prose">
      <p className="eyebrow">Operations</p>
      <h1 className="mt-2 text-2xl font-semibold">Sentry check</h1>
      <p className="mt-2 text-ink-2">
        Each control below causes an error on purpose. With the Sentry DSN set on this deployment,
        the error appears in Sentry within a minute. The message holds a fake email, invite link and
        join code; in Sentry they should read as [email], /c/[redacted] and [code].
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <ThrowButton />
        <a className="text-ink-1 underline underline-offset-4" href="/gallery/sentry-check/server">
          Throw on the server
        </a>
      </div>
    </article>
  );
}
