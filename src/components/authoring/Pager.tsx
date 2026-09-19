import Link from "next/link";

export interface PagerProps {
  page: number;
  pageCount: number;
  /** The URL of a page, keeping everything else the list is filtered by. */
  hrefFor: (page: number) => string;
}

const linkClass =
  "tap-target inline-flex items-center rounded-sm border border-line bg-surface-1 px-3 text-sm " +
  "font-medium text-accent-ink transition-colors duration-fast hover:border-line-strong " +
  "hover:bg-surface-2";

/** Previous and next links for a paged list, kept in the URL. Nothing for a single page. */
export function Pager({ page, pageCount, hrefFor }: PagerProps) {
  if (pageCount <= 1 && page <= 1) return null;
  const pastEnd = page > pageCount;

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      {pastEnd ? (
        <>
          <p className="text-sm text-ink-2">Page {page} is past the end.</p>
          <Link href={hrefFor(1)} className={linkClass}>
            First page
          </Link>
        </>
      ) : (
        <>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={linkClass}>
              Previous page
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-ink-2 tabular-nums">
            Page {page} of {pageCount}
          </p>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} className={linkClass}>
              Next page
            </Link>
          ) : (
            <span />
          )}
        </>
      )}
    </nav>
  );
}
