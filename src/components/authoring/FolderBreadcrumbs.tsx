import Link from "next/link";
import { textLinkClasses } from "@/components/ui/TextLink";
import { NOT_IN_A_FOLDER, type FolderRow, type FolderView } from "@/lib/authoring/folders";

export interface FolderBreadcrumbsProps {
  bankId: string;
  bankName: string;
  /** The open folder's ancestors from the top down, ending with it; empty outside a folder. */
  trail: readonly FolderRow[];
  view: FolderView;
  /** The library folders the quiz is filed in, from the top down (#411); empty when in none. */
  libraryTrail?: readonly FolderRow[];
}

export interface Crumb {
  label: string;
  /** Absent for the current page. */
  href?: string;
}

const NONE: readonly FolderRow[] = [];

/** The library, then each library folder down to `trail`'s last, which is linked unless current. */
export function libraryCrumbs(trail: readonly FolderRow[], lastIsCurrent: boolean): Crumb[] {
  return [
    { label: "Library", href: lastIsCurrent && trail.length === 0 ? undefined : "/author" },
    ...trail.map((row, index) => ({
      label: row.name,
      href: lastIsCurrent && index === trail.length - 1 ? undefined : `/author?folder=${row.id}`,
    })),
  ];
}

function crumbsFor({
  bankId,
  bankName,
  trail,
  view,
  libraryTrail = NONE,
}: FolderBreadcrumbsProps): Crumb[] {
  const base = `/author/banks/${bankId}`;
  const crumbs: Crumb[] = [
    ...libraryCrumbs(libraryTrail, false),
    { label: bankName, href: view.kind === "all" ? undefined : base },
  ];
  if (view.kind === "unfiled") return [...crumbs, { label: NOT_IN_A_FOLDER }];
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

/** A trail of links up to the library; the last crumb, the current page, is not a link. */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2">
        {crumbs.map((crumb, index) => (
          <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-x-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-ink-2">
                /
              </span>
            ) : null}
            {crumb.href ? (
              // A 44px target, though the line reads small (WCAG 2.5.8).
              <Link href={crumb.href} className={textLinkClasses({ size: "sm" })}>
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

/** Where the open view sits: the library, the quiz, then each folder down to the open one. */
export function FolderBreadcrumbs(props: FolderBreadcrumbsProps) {
  return <Breadcrumbs crumbs={crumbsFor(props)} />;
}
