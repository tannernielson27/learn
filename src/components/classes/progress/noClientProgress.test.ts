// A class's progress is every student's scores and attendance side by side, for the class's own
// teacher only. `class_progress` already answers nobody else; this keeps the code that reads and
// shapes it off everything a participant's phone or a student's browser loads, directly or
// through anything it imports, the way `noClientResults.test.ts` keeps the room's results on the
// host's console. A student's own results come from their own functions (`my_*`), never this.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../../testing/importGraph";

/** What builds or reads a class's progress. */
const GUARDED = [
  path.join(SRC, "lib", "classes", "progress.ts"),
  path.join(SRC, "lib", "classes", "studentProgress.ts"),
  path.join(SRC, "lib", "classes", "progressCsv.ts"),
  path.join(SRC, "lib", "classes", "progressCsvRoute.ts"),
  path.join(SRC, "lib", "classes", "classProgressFixture.ts"),
  path.join(SRC, "lib", "supabase", "classProgress.ts"),
];
const GUARDED_DIR = path.join(SRC, "components", "classes", "progress");

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pagesUnder(full);
    return /^(page|layout|route)\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every page a participant or a student opens, and the components a phone runs. */
const STUDENT_ENTRIES = [
  ...pagesUnder(path.join(SRC, "app", "learn")),
  ...pagesUnder(path.join(SRC, "app", "join")),
  ...pagesUnder(path.join(SRC, "app", "play")),
  path.join(SRC, "app", "join", "JoinScreen.tsx"),
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  path.join(SRC, "components", "live", "JoinForm.tsx"),
  path.join(SRC, "components", "question", "ItemPlayer.tsx"),
];

const offenders = (entry: string) =>
  [...reachable(entry).entries()]
    .filter(([file]) => GUARDED.includes(file) || file.startsWith(GUARDED_DIR + path.sep))
    .map(([, chain]) => shortest(chain));

describe("a class's progress stays with its teacher", () => {
  it("found the student pages to check", () => {
    expect(STUDENT_ENTRIES.length).toBeGreaterThan(8);
  });

  it.each(STUDENT_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches the class progress code",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(1);
      expect(offenders(entry)).toEqual([]);
    },
  );

  it("would catch it: the teacher's class page does reach it", () => {
    const classPage = path.join(SRC, "app", "author", "classes", "[classId]", "page.tsx");
    expect(offenders(classPage).length).toBeGreaterThan(0);
  });
});
