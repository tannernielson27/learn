import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
 * exists. `src/app/gallery/gate.test.ts` fails if a gallery route ever gets around this.
 */
export default function GalleryLayout({ children }: LayoutProps<"/gallery">) {
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
