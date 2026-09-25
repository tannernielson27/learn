import type { Metadata } from "next";
import { EMAIL_PREVIEWS } from "@/lib/email/preview";

export const metadata: Metadata = { title: "Email preview" };

/**
 * Every message LeaRN sends, with sample data (#268). Not in the gallery nav: it is opened by URL,
 * and it is closed on production with the rest of `/gallery` (src/proxy.ts, then the layout).
 *
 * The HTML is set as markup on purpose: it is the email itself, built by `src/lib/email/layout.ts`,
 * which escapes every string, from fixed sample data that no request can change.
 */
export default function EmailPreviewPage() {
  return (
    <article className="max-w-3xl">
      <p className="eyebrow">Operations</p>
      <h1 className="mt-2 text-2xl font-semibold">Email preview</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        The messages LeaRN sends, in the one layout they share. Supabase sends the sign-in link from
        supabase/templates/magic_link.html, which is generated from the same code. Sample data is
        fictional, and no link here works.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {EMAIL_PREVIEWS.map((preview) => (
          <li key={preview.id}>
            <a className="text-ink-1 underline underline-offset-4" href={`#${preview.id}`}>
              {preview.name}
            </a>
          </li>
        ))}
      </ul>
      {EMAIL_PREVIEWS.map((preview) => (
        <section
          key={preview.id}
          id={preview.id}
          aria-labelledby={`${preview.id}-name`}
          className="mt-10 scroll-mt-6"
        >
          <h2 id={`${preview.id}-name`} className="text-lg font-semibold">
            {preview.name}
          </h2>
          <p className="mt-1 text-ink-2">
            Subject: <span className="text-ink-1">{preview.subject}</span>
          </p>
          <div
            data-email={preview.id}
            className="mt-4 overflow-hidden rounded-md border border-line"
            dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
          />
          <h3 className="mt-6 text-base font-semibold">Plain-text part</h3>
          {preview.text === null ? (
            <p className="mt-1 max-w-prose text-ink-2">
              Supabase Auth sends this message as HTML only; the app does not control its plain-text
              part.
            </p>
          ) : (
            <pre
              data-email-text={preview.id}
              className="mt-2 rounded-md border border-line bg-surface-1 p-4 font-mono text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {preview.text}
            </pre>
          )}
        </section>
      ))}
    </article>
  );
}
