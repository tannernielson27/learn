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

const SPRINT_ONE = new Set<string>([
  "multiple_choice",
  "multiple_response",
  "multiple_response_grouping",
  "matrix_multiple_choice",
  "matrix_multiple_response",
  "dropdown_cloze",
  "dropdown_rationale",
  "dropdown_table",
]);

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
                <span className="whitespace-nowrap">{ITEM_TYPE_LABELS[type]}</span>
                <span
                  className={`rounded-sm px-1.5 font-mono text-xs ${ready ? "bg-accent-soft text-accent-ink" : "bg-surface-2"}`}
                >
                  {ready ? "ready" : SPRINT_ONE.has(type) ? "S1" : "S2"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
