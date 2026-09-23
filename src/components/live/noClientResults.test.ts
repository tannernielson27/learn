// #180: how a room answered an item (`src/lib/live/results`) marks the correct choices, so it is
// the host's alone. The console computes it from the stored answers it reads under its own org's
// row level security; nothing a participant loads may carry the code that builds it, directly or
// through anything it imports — the same rule `noClientScoring.test.ts` holds for the scoring
// engine (ADR 0003). The wire itself is checked in `supabaseRoom.test.ts`.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../testing/importGraph";

const RESULTS_DIR = path.join(SRC, "lib", "live", "results");

/** Everything a participant's browser runs, and the pages and routes that serve them. */
const PARTICIPANT_ENTRIES = [
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "JoinForm.tsx"),
  path.join(SRC, "app", "join", "JoinScreen.tsx"),
  path.join(SRC, "app", "join", "page.tsx"),
  path.join(SRC, "components", "question", "ItemPlayer.tsx"),
  path.join(SRC, "app", "play", "[sessionId]", "page.tsx"),
];

const offenders = (entry: string) =>
  [...reachable(entry).entries()]
    .filter(([file]) => file.startsWith(RESULTS_DIR + path.sep))
    .map(([, chain]) => shortest(chain));

describe("the room's results stay on the host's console", () => {
  it.each(PARTICIPANT_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches src/lib/live/results",
    (_name, entry) => {
      // A sanity check that the walk walked: every entry imports something of its own.
      expect(reachable(entry).size).toBeGreaterThan(2);
      expect(offenders(entry)).toEqual([]);
    },
  );

  it("would catch it: the host console does reach it", () => {
    const console_ = path.join(SRC, "components", "live", "HostLobby.tsx");
    expect(offenders(console_).length).toBeGreaterThan(0);
  });
});
