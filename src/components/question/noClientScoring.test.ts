// ADR 0003 / #56: the shared players render for students, so the scoring engine must not reach
// their bundle — directly or through anything they import. Scores are passed in as props. The
// gallery and the authoring preview import the engine themselves, which keeps it in their own
// route bundles.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeChain, importGraph, SRC } from "./testing/importGraph";

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
];

/**
 * Every module reachable from `entry`, as a map from file to the chain of imports that reached it.
 * Lazy `import()`s count (#54): a renderer's own chunk still runs in the student's browser.
 */
const reachable = (entry: string) => importGraph(entry).files;

describe("the shared players hold no scoring code", () => {
  it.each(ENTRY_POINTS.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches the scoring engine",
    (_name, entry) => {
      const graph = reachable(entry);
      // A sanity check that the walk actually walked: the player pulls in its renderers.
      expect(graph.size).toBeGreaterThan(20);
      const offenders = [...graph.entries()]
        .filter(([file]) => file.startsWith(ENGINE_DIR + path.sep))
        .map(([, chain]) => describeChain(chain));
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
