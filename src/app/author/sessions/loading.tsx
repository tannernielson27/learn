import { ReadingWidth } from "@/components/authoring/PageWidth";
import { SkeletonPage } from "@/components/ui/Skeleton";

/**
 * The Live sessions list in outline while it loads (#563): `PageHeader`'s shape with the page's
 * own h1 drawn as it will be, then ruled rows the shape of a session's row. Nothing moves.
 *
 * Only this leaf has a loading state. A `loading.tsx` starts the response streaming, after which
 * a page's `notFound()` can no longer answer 404; this page has none and no child routes, so
 * nothing here loses a status code. `requireAuthor` sending a student on still works, as a
 * client-side redirect (docs: file-conventions/loading, "Status Codes"). The reports
 * (`/live/[sessionId]/report`, `/author/assignments/[assignmentId]/report`) call `notFound()`, so
 * they have no loading state of their own (`src/app/loadingBoundaries.test.ts`).
 */
export default function SessionsLoading() {
  return (
    // The page's reading column, so the list lands where its outline stood.
    <ReadingWidth>
      <SkeletonPage label="Loading live sessions" shape="list" title="Live sessions" />
    </ReadingWidth>
  );
}
