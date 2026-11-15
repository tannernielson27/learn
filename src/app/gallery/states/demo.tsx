"use client";

import {
  AuthorErrorView,
  CaseStudyErrorView,
  GlobalErrorView,
  HostErrorView,
  LearnErrorView,
  PlayItemErrorView,
  ReportErrorView,
  RoomErrorView,
  RootErrorView,
  type RouteErrorViewProps,
} from "@/components/status/RouteErrorViews";
import type { ComponentType } from "react";
import type { ErrorStateId } from "./states";

const VIEWS = {
  "error-author": AuthorErrorView,
  "error-case-study": CaseStudyErrorView,
  "error-play-item": PlayItemErrorView,
  "error-live": HostErrorView,
  "error-report": ReportErrorView,
  "error-room": RoomErrorView,
  "error-learn": LearnErrorView,
  "error-root": RootErrorView,
  "error-global": GlobalErrorView,
} satisfies Record<ErrorStateId, ComponentType<RouteErrorViewProps>>;

/** A made-up digest, so the reference line shows as it does after a server error. */
const DIGEST = "2861533018";

/**
 * A route's error view with no error behind it: nothing is thrown, so nothing is reported, and
 * Try again does nothing here. The views are client components, so this is one too.
 */
export function ErrorDemo({ state }: { state: ErrorStateId }) {
  const View = VIEWS[state];
  return <View retry={() => {}} digest={DIGEST} landmark={false} />;
}
