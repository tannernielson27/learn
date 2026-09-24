"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SENTRY_CHECK_MESSAGE } from "./message";

/**
 * Breaks this page in the browser on purpose. The throw happens during render, so the root
 * `global-error.tsx` catches it and reports it the same way every route boundary does.
 */
export function ThrowButton() {
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error(SENTRY_CHECK_MESSAGE("browser"));
  return <Button onClick={() => setBroken(true)}>Throw in the browser</Button>;
}
