"use client";

import { useEffect, useState } from "react";
import { SUBMIT_GRACE_MS, timeIsUp, type ItemTimer } from "@/lib/live/timer";

/**
 * Whether the question's time and its grace are over, so the server would refuse an answer now
 * (`timeIsUp`, the same rule `/api/live/submit` applies), on the session's clock (`serverNow`),
 * never this phone's. Re-renders once at the moment it turns true, and only then: a question with
 * no running clock (none at all, or held still by a pause) never closes.
 *
 * A clock the teacher extends has a new `endsAt`, so the question opens again at once.
 */
export function useAnswersClosed(timer: ItemTimer, serverNow: () => number): boolean {
  const [, setChecked] = useState(0);
  const { endsAt } = timer;

  useEffect(() => {
    if (endsAt === null) return;
    // `timeIsUp` is strictly past the grace, so wake a millisecond after it.
    const wait = endsAt + SUBMIT_GRACE_MS - serverNow() + 1;
    if (wait <= 0) return;
    const handle = setTimeout(() => setChecked((count) => count + 1), wait);
    return () => clearTimeout(handle);
  }, [endsAt, serverNow]);

  return timeIsUp(timer, serverNow());
}
