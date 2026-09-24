// ADR 0003 / #56: the shared players render for students, so the scoring engine must not reach
// their bundle — directly or through anything they import. Scores are passed in as props. The
// gallery and the authoring preview import the engine themselves, which keeps it in their own
// route bundles.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachable, shortest } from "../testing/importGraph";

const ENGINE_DIR = path.join(SRC, "lib", "ngn", "scoring");

/**
 * The players a student can be put in front of, and — since #133 — the live-session screen that
 * mounts one. That screen is the first place outside the gallery where a real student answers a
 * real item, so it is held to the same rule: the scoring engine is the server's, and a phone that
 * cannot score cannot be made to leak how an item is scored.
 */
const ENTRY_POINTS = [
  path.join(SRC, "components", "question", "ItemPlayer.tsx"),
  path.join(SRC, "components", "case-study", "CaseStudyPlayer.tsx"),
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  // #185: the student-paced phone mounts the same player over a whole set.
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  // #208: a take-home attempt mounts the same player over a set, and saves rather than scores.
  path.join(SRC, "components", "assignments", "AttemptPlayer.tsx"),
  // #210: the results after close show marks computed on the server at submit, never here.
  path.join(SRC, "components", "assignments", "results", "AssignmentResults.tsx"),
];

describe("the shared players hold no scoring code", () => {
  it.each(ENTRY_POINTS.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches the scoring engine",
    (_name, entry) => {
      const graph = reachable(entry);
      // A sanity check that the walk actually walked: the player pulls in its renderers.
      expect(graph.size).toBeGreaterThan(20);
      const offenders = [...graph.entries()]
        .filter(([file]) => file.startsWith(ENGINE_DIR + path.sep))
        .map(([, chain]) => shortest(chain));
      expect(offenders).toEqual([]);
    },
  );

  it("would catch the engine coming back", () => {
    // The gallery is allowed to score in the browser, so it is the proof that the walk finds it.
    const gallery = path.join(SRC, "app", "gallery", "items", "[type]", "playground.tsx");
    const reached = [...reachable(gallery).keys()];
    expect(reached.some((f) => f.startsWith(ENGINE_DIR + path.sep))).toBe(true);
  });

  it("follows a renderer loaded lazily into its own chunk", () => {
    // The renderers sit behind `import()` since #54; a walk that skipped them would pass vacuously.
    const player = reachable(ENTRY_POINTS[0]);
    const bowtie = path.join(SRC, "components", "question", "bowtie", "BowtieItem.tsx");
    expect(player.has(bowtie)).toBe(true);
  });
});
