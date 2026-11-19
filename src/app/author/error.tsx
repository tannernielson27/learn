"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { AuthorErrorView } from "@/components/status/RouteErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * Any authoring page that fails to render (#164). It sits inside the authoring layout, so the
 * header (the nav and the account menu) stays on the screen, and the page adds the way back to the library. `retry` asks the server
 * for the page again, which is also what reloads anything saved since.
 */
export default function AuthorError({ error, retry }: ErrorInfo) {
  const eventId = useReportError(error);
  return <AuthorErrorView retry={retry} digest={errorDigest(error)} eventId={eventId} />;
}
