import Link from "next/link";
import type { FolderRow, FolderView } from "@/lib/authoring/folders";

export interface FolderBreadcrumbsProps {
  bankId: string;
  bankName: string;
  /** The open folder's ancestors from the top down, ending with it; empty outside a folder. */
  trail: readonly FolderRow[];
  view: FolderView;
}

interface Crumb {
  label: string;
  /** Absent for the current page. */
  href?: string;
}

function crumbsFor({ bankId, bankName, trail, view }: FolderBreadcrumbsProps): Crumb[] {
  const base = `/author/banks/${bankId}`;
  const crumbs: Crumb[] = [
    { label: "Item banks", href: "/author" },
    { label: bankName, href: view.kind === "all" ? undefined : base },
  ];
  if (view.kind === "unfiled") return [...crumbs, { label: "Unfiled" }];
  if (view.kind === "folder") {
    return [
      ...crumbs,
      ...trail.map((row, index) => ({
        label: row.name,
        href: index < trail.length - 1 ? `${base}?folder=${row.id}` : undefined,
      })),
    ];
  }
  return crumbs;
}

/** Where the open view sits: bank list, bank, then each folder down to the open one. */
export function FolderBreadcrumbs(props: FolderBreadcrumbsProps) {
  const crumbs = crumbsFor(props);
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((crumb, index) => (
          <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-x-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-ink-2">
                /
              </span>
            ) : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-accent-ink underline-offset-4 hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="break-words text-ink-2">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
