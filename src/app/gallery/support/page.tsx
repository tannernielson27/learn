import type { Metadata } from "next";
import { SupportDemo } from "./demo";

export const metadata: Metadata = { title: "Tell us about a problem" };

/** #568: the problem form in every state, with a fake send, for screenshots and axe. */
export default function SupportGalleryPage() {
  return (
    <article className="max-w-4xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Tell us about a problem</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        The form a signed-in teacher or student sends support from the account menu, an error screen
        or the help page. One box; the page, the error reference and who is asking are added for
        them.
      </p>
      <SupportDemo />
    </article>
  );
}
