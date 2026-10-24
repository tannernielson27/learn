// The top 5 at the end of a live session names other students and their points, so it is the
// teacher's projector's alone. Nothing a participant loads may carry the code that asks for it or
// the route handler that reads it, directly or through anything it imports. The route itself
// refuses anyone without an author session (`podiumRoute.test.ts`).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../testing/importGraph";

const PODIUM_FILES = [
  path.join(SRC, "components", "live", "stage", "StagePodium.tsx"),
  path.join(SRC, "components", "live", "stage", "StageEndedLive.tsx"),
  path.join(SRC, "lib", "supabase", "podiumRoute.ts"),
];

/** Everything a participant's browser runs, and the pages and routes that serve them. */
const PARTICIPANT_ENTRIES = [
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  path.join(SRC, "components", "live", "JoinForm.tsx"),
  path.join(SRC, "app", "join", "JoinScreen.tsx"),
  path.join(SRC, "app", "join", "page.tsx"),
  path.join(SRC, "components", "question", "ItemPlayer.tsx"),
  path.join(SRC, "app", "play", "[sessionId]", "page.tsx"),
];

const offenders = (entry: string) =>
  [...reachable(entry).entries()]
    .filter(([file]) => PODIUM_FILES.includes(file))
    .map(([, chain]) => shortest(chain));

describe("the top 5 stays on the teacher's projector", () => {
  it.each(PARTICIPANT_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches the podium",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(2);
      expect(offenders(entry)).toEqual([]);
    },
  );

  it("would catch it: the host console does reach it", () => {
    const console_ = path.join(SRC, "components", "live", "HostLobby.tsx");
    expect(offenders(console_).length).toBeGreaterThan(0);
  });
});
