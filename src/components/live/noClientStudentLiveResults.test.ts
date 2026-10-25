// A student's own live session results (`/learn/live/[sessionId]` and the student home's Live
// sessions list) carry keys and rationales once a session has ended. The phone a live session is
// played on must not import any of it, directly or through anything it imports: the live phone
// path stays as small and as keyless as `e2e/liveBytes.spec.ts` holds it.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../testing/importGraph";

const STUDENT_RESULTS = [
  path.join(SRC, "lib", "learn") + path.sep,
  path.join(SRC, "app", "learn", "live") + path.sep,
  path.join(SRC, "components", "learn", "LiveSessionHistory.tsx"),
  path.join(SRC, "components", "learn", "LiveSessionResults.tsx"),
  path.join(SRC, "lib", "supabase", "liveResults.ts"),
];

/** Everything a participant's browser runs, and the pages and routes that serve them. */
const LIVE_PHONE_ENTRIES = [
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  path.join(SRC, "components", "live", "JoinForm.tsx"),
  path.join(SRC, "app", "join", "JoinScreen.tsx"),
  path.join(SRC, "app", "join", "page.tsx"),
  path.join(SRC, "app", "join", "[code]", "page.tsx"),
  path.join(SRC, "app", "join", "actions.ts"),
  path.join(SRC, "app", "play", "[sessionId]", "page.tsx"),
  path.join(SRC, "app", "api", "live", "view", "route.ts"),
  path.join(SRC, "app", "api", "live", "submit", "route.ts"),
  path.join(SRC, "app", "api", "live", "channel", "route.ts"),
];

const isStudentResults = (file: string) =>
  STUDENT_RESULTS.some((entry) =>
    entry.endsWith(path.sep) ? file.startsWith(entry) : file === entry,
  );

const offenders = (entry: string) =>
  [...reachable(entry).entries()]
    .filter(([file]) => isStudentResults(file))
    .map(([, chain]) => shortest(chain));

describe("a student's own live results stay off the live phone path", () => {
  it.each(LIVE_PHONE_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches them",
    (_name, entry) => {
      // A sanity check that the walk walked: every entry imports something of its own.
      expect(reachable(entry).size).toBeGreaterThan(2);
      expect(offenders(entry)).toEqual([]);
    },
  );

  it("would catch it: the student home does reach them", () => {
    const home = path.join(SRC, "app", "learn", "(home)", "page.tsx");
    expect(offenders(home).length).toBeGreaterThan(0);
  });
});
