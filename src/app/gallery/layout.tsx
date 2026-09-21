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
 * The gate lives here rather than on each page because this layout is the one thing every
 * `/gallery/**` route passes through, which makes a new route gated the moment it is added.
 * `notFound()` rather than a redirect or a message: a 404 does not advertise that the surface
 * exists. `layout.test.ts` calls this function to check that it really refuses, and
 * `gate.test.ts` checks that every gallery route goes through it.
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
