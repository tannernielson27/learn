import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { galleryIsAvailable } from "@/lib/gallery/availability";
import { GalleryNav } from "./nav";

export const metadata: Metadata = { title: "Gallery" };

/**
 * ADR 0003 / #146: every route under `/gallery` renders a fixture together with its answer key,
 * so the whole segment is closed on the production deployment — the only one with real students.
 *
 * **This is the second layer, not the boundary.** `src/proxy.ts` is the boundary, because it runs
 * before anything renders. This gate cannot be, and was tried as one: a layout and the page
 * beneath it render concurrently, so `notFound()` here ends this segment while the page subtree
 * that already rendered is still serialized into the same Flight stream. The response came back
 * 404 with the fixtures in it — 21KB and two `answerKey` objects for `/gallery/items/[type]`.
 * Keep the gate; do not mistake it for what withholds the payload. `scripts/gallery-closed.mjs`
 * is the check that reads the response rather than the component.
 *
 * `await connection()` first, and it is load-bearing. Without it nothing in this segment reaches
 * for a request, so Next prerenders `/gallery/**` at build time and bakes this decision into the
 * artifact. The gate would then only mean "this bundle was compiled with VERCEL_ENV=production",
 * and Vercel's **Promote to Production** ships an existing deployment without rebuilding it — a
 * preview artifact, compiled with the gallery open, serving the production domain from the CDN
 * with no build step left to catch it. `connection()` stops prerendering here
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`), so the
 * check reads the environment of the server answering the request. The cost is that the segment
 * is no longer statically generated, which is the right trade for a debug surface no student
 * should reach.
 */
export default async function GalleryLayout({ children }: LayoutProps<"/gallery">) {
  await connection();
  if (!galleryIsAvailable()) notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-surface-1 md:w-64 md:shrink-0 md:border-r md:border-b-0">
        {/* Wraps in the 256px sidebar so the theme toggle drops under the title instead of overflowing. */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="eyebrow">LeaRN</p>
            <p className="text-sm font-semibold">Component gallery</p>
          </div>
          <ThemeToggle />
        </div>
        <GalleryNav />
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12">{children}</main>
    </div>
  );
}
