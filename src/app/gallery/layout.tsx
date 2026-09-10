import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { GalleryNav } from "./nav";

export const metadata: Metadata = { title: "Gallery" };

export default function GalleryLayout({ children }: LayoutProps<"/gallery">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-surface-1 md:w-64 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
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
