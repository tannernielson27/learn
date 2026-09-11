"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasRenderer } from "@/components/question/registry";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "@/lib/ngn/registry";

const FOUNDATIONS = [
  { href: "/gallery", label: "Overview" },
  { href: "/gallery/tokens", label: "Tokens" },
  { href: "/gallery/typography", label: "Typography" },
  { href: "/gallery/primitives", label: "Primitives" },
] as const;

export function GalleryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Gallery" className="px-3 pb-4 md:pb-8">
      <p className="eyebrow px-2 pt-2 pb-1">Foundations</p>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {FOUNDATIONS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tap-target flex items-center rounded-sm px-2 text-sm transition-colors duration-fast ${
                  active
                    ? "bg-accent-soft font-medium text-accent-ink"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="eyebrow px-2 pt-5 pb-1">Item types</p>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {ITEM_TYPES.map((type) => {
          const href = `/gallery/items/${type}`;
          const active = pathname === href;
          const ready = hasRenderer(type);
          return (
            <li key={type} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`tap-target flex items-center justify-between gap-2 rounded-sm px-2 text-sm transition-colors duration-fast ${
                  active
                    ? "bg-accent-soft font-medium text-accent-ink"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"
                }`}
              >
                {/* One line in the phone's scrolling row; wraps in the sidebar at 768px and up. */}
                <span className="whitespace-nowrap md:whitespace-normal">
                  {ITEM_TYPE_LABELS[type]}
                </span>
                {/* Every type has a renderer now; the tag only marks a new type still being built. */}
                {ready ? null : (
                  <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 font-mono text-xs">
                    soon
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
