import { ReadingWidth } from "@/components/authoring/PageWidth";
import { SkeletonPage } from "@/components/ui/Skeleton";

/**
 * The Live sessions list in outline while it loads (docs/04 §11 "Loading"): the page's real
 * title, drawn as the h1 it will be, over rows the shape of a session's row.
 *
 * Only this leaf has a loading state. A `loading.tsx` starts the response streaming, after which
 * a page's `notFound()` can no longer answer 404; this page has none and no child routes, so
 * nothing here loses a status code. `requireAuthor` sending a student on still works, as a
 * client-side redirect (docs: file-conventions/loading, "Status Codes").
 */
export default function SessionsLoading() {
  return (
    // The page's reading column, so the list lands where its outline stood.
    <ReadingWidth>
      <SkeletonPage label="Loading live sessions" shape="list" title="Live sessions" />
    </ReadingWidth>
  );
}
