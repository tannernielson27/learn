"use client";

import type { ErrorInfo } from "next/error";
import { useReportError } from "@/components/observability/useReportError";
import { HostErrorView } from "@/components/status/RouteErrorViews";
import { errorDigest } from "@/components/status/errorDigest";

/**
 * The host console, when something in it fails to render (#164). The session lives in the
 * database, not in this page, so nothing the students see changes while the console is down. It
 * does not say the session is running: the console of an ended session fails the same way.
 * `retry` (a `router.refresh()` and a reset in one transition) reads the session again on the
 * server and mounts the console fresh, which reopens its channel.
 */
export default function HostError({ error, retry }: ErrorInfo) {
  useReportError(error);
  return <HostErrorView retry={retry} digest={errorDigest(error)} />;
}
