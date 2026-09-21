"use client";

import type { ErrorInfo } from "next/error";
import { RouteRecovery } from "@/components/recovery/RouteRecovery";

/**
 * Any authoring page that fails to render (#164). It sits inside the authoring layout, so the
 * header — the way back to the banks, and Sign out — stays on the screen. `retry` asks the server
 * for the page again, which is also what reloads anything saved since.
 */
export default function AuthorError({ retry }: ErrorInfo) {
  return (
    <RouteRecovery
      headline="This page could not be shown."
      detail="Try again to load it. Changes you had not saved may be lost."
      onRetry={retry}
    />
  );
}
