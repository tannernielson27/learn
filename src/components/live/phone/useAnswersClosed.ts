"use client";

import { useEffect, useState } from "react";
import { SUBMIT_GRACE_MS, timeIsUp, type ItemTimer } from "@/lib/live/timer";

/**
 * Whether the question's time and its grace are over, so the server would refuse an answer now
 * (`timeIsUp`, the same rule `/api/live/submit` applies), on the session's clock (`serverNow`),
 * never this phone's. A question with no running clock (none at all, or held still by a pause)
 * never closes.
 *
 * **Only once the session's clock is known** (`clockKnown`: the phone has heard the room once,
 * which is when the transport measures its offset). Before that `serverNow` is this phone's own
 * clock, and a phone running fast would close Submit early, or on a late joiner's first paint.
 * Open is the safe side: an answer the server refuses comes back as the late screen.
 *
 * The wake-up is armed again on every render rather than once per `endsAt`, because the offset
 * behind `serverNow` is measured again with each view the room sends, and each view renders.
 * A clock the teacher extends has a new `endsAt`, so the question opens again at once.
 */
export function useAnswersClosed(
  timer: ItemTimer,
  serverNow: () => number,
  clockKnown: boolean,
): boolean {
  const [, setChecked] = useState(0);
  const { endsAt } = timer;

  useEffect(() => {
    if (!clockKnown || endsAt === null) return;
    // `timeIsUp` is strictly past the grace, so wake a millisecond after it.
    const wait = endsAt + SUBMIT_GRACE_MS - serverNow() + 1;
    if (wait <= 0) return;
    const handle = setTimeout(() => setChecked((count) => count + 1), wait);
    return () => clearTimeout(handle);
  });

  return clockKnown && timeIsUp(timer, serverNow());
}
