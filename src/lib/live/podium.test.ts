import { describe, expect, it } from "vitest";
import {
  PODIUM_MAX_NAMES,
  parsePodium,
  podiumGroups,
  podiumOfReport,
  rankPodium,
  type PodiumScore,
} from "./podium";
import { buildSessionReport } from "./report";
import { REPORT_FIXTURE } from "./reportFixture";

const score = (displayName: string, points: number): PodiumScore => ({
  participantId: `p-${displayName.toLowerCase().replace(/\W/g, "")}`,
  displayName,
  points,
});

const placesOf = (scores: PodiumScore[]) =>
  rankPodium(scores)?.entries.map((entry) => [entry.place, entry.displayName, entry.tied]);

describe("rankPodium: standard competition ranking", () => {
  it("ranks five different scores 1 to 5, highest first", () => {
    const podium = rankPodium([
      score("Cleo", 3),
      score("Ava", 9),
      score("Eli", 1),
      score("Ben", 7),
      score("Dev", 2),
      score("Fay", 0.5),
    ]);
    expect(podium?.entries.map((e) => [e.place, e.displayName, e.points, e.tied])).toEqual([
      [1, "Ava", 9, false],
      [2, "Ben", 7, false],
      [3, "Cleo", 3, false],
      [4, "Dev", 2, false],
      [5, "Eli", 1, false],
    ]);
    expect(podium?.more).toBe(0);
  });

  it("shares 1st on a tie and skips 2nd, alphabetically inside the tie", () => {
    expect(
      placesOf([
        score("Zoe", 8),
        score("Ava", 8),
        score("Cleo", 5),
        score("Dev", 4),
        score("Eli", 3),
      ]),
    ).toEqual([
      [1, "Ava", true],
      [1, "Zoe", true],
      [3, "Cleo", false],
      [4, "Dev", false],
      [5, "Eli", false],
    ]);
  });

  it("shares 3rd on a tie and skips 4th", () => {
    expect(
      placesOf([
        score("Ava", 9),
        score("Ben", 8),
        score("Eli", 5),
        score("Cleo", 5),
        score("Dev", 1),
      ]),
    ).toEqual([
      [1, "Ava", false],
      [2, "Ben", false],
      [3, "Cleo", true],
      [3, "Eli", true],
      [5, "Dev", false],
    ]);
  });

  it("shows everyone tied at 5th, and nobody below them", () => {
    expect(
      placesOf([
        score("Ava", 9),
        score("Ben", 8),
        score("Cleo", 7),
        score("Dev", 6),
        score("Gus", 2),
        score("Eli", 2),
        score("Fay", 2),
        score("Hal", 1),
      ]),
    ).toEqual([
      [1, "Ava", false],
      [2, "Ben", false],
      [3, "Cleo", false],
      [4, "Dev", false],
      [5, "Eli", true],
      [5, "Fay", true],
      [5, "Gus", true],
    ]);
  });

  it("puts everyone at 1st when everyone has the same score", () => {
    expect(placesOf([score("Cleo", 4), score("Ava", 4), score("Ben", 4)])).toEqual([
      [1, "Ava", true],
      [1, "Ben", true],
      [1, "Cleo", true],
    ]);
  });

  it("shows fewer than five when fewer than five people scored", () => {
    expect(placesOf([score("Ben", 2), score("Ava", 3)])).toEqual([
      [1, "Ava", false],
      [2, "Ben", false],
    ]);
  });

  it("leaves out anyone with no points, so nobody stands on the podium with zero", () => {
    expect(placesOf([score("Ava", 2), score("Ben", 0), score("Cleo", 0)])).toEqual([
      [1, "Ava", false],
    ]);
  });

  it("is null when nobody scored anything", () => {
    expect(rankPodium([score("Ava", 0), score("Ben", 0)])).toBeNull();
    expect(rankPodium([])).toBeNull();
  });

  it("leaves out a negative total, which the per-question floor should make impossible", () => {
    expect(placesOf([score("Ava", -1), score("Ben", 1)])).toEqual([[1, "Ben", false]]);
    expect(rankPodium([score("Ava", -2)])).toBeNull();
  });

  it("shows eight names and counts the rest when a tie would put more than eight on screen", () => {
    const names = ["Ava", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai"];
    const podium = rankPodium([score("Top", 10), ...names.map((name) => score(name, 4))]);
    expect(podium?.entries).toHaveLength(PODIUM_MAX_NAMES);
    expect(podium?.entries.map((e) => [e.place, e.displayName])).toEqual([
      [1, "Top"],
      [2, "Ava"],
      [2, "Ben"],
      [2, "Cleo"],
      [2, "Dev"],
      [2, "Eli"],
      [2, "Fay"],
      [2, "Gus"],
    ]);
    expect(podium?.more).toBe(4);
  });

  it("treats totals that differ only by floating-point noise as a tie", () => {
    expect(placesOf([score("Ava", 0.1 + 0.2), score("Ben", 0.3)])).toEqual([
      [1, "Ava", true],
      [1, "Ben", true],
    ]);
  });

  it("orders a tie case-insensitively, and the same name twice by id, so the order never flickers", () => {
    const podium = rankPodium([
      { participantId: "p-2", displayName: "ava", points: 1 },
      { participantId: "p-1", displayName: "Ava", points: 1 },
      { participantId: "p-3", displayName: "Ben", points: 1 },
    ]);
    expect(podium?.entries.map((e) => e.displayName)).toEqual(["Ava", "ava", "Ben"]);
  });

  it("keeps a display name exactly as it was typed", () => {
    const name = `<img src=x onerror="alert(1)"> & Zoë`;
    expect(rankPodium([score(name, 1)])?.entries[0]?.displayName).toBe(name);
  });
});

describe("podiumOfReport: the teacher's report's own totals", () => {
  it("ranks the report's students by the points the report adds up", () => {
    const podium = podiumOfReport(buildSessionReport(REPORT_FIXTURE));
    // Ava 5, Ben 2, Cleo 1 (a name written to break a spreadsheet, kept as typed), Dev answered nothing.
    expect(podium?.entries.map((e) => [e.place, e.displayName, e.points])).toEqual([
      [1, "Ava", 5],
      [2, "Ben", 2],
      [3, "=cmd|' /C calc'!A0", 1],
    ]);
  });

  it("is null when nobody answered anything", () => {
    const report = buildSessionReport({ ...REPORT_FIXTURE, responses: [] });
    expect(podiumOfReport(report)).toBeNull();
  });

  it("is null when no question was worth anything", () => {
    const report = buildSessionReport({
      ...REPORT_FIXTURE,
      responses: [{ participantId: "p-ava", itemPosition: 1, points: 0, maxPoints: 0 }],
    });
    expect(podiumOfReport(report)).toBeNull();
  });
});

describe("podiumGroups: places on the podium and the list beneath", () => {
  it("groups a shared place together and orders the reveal from the bottom up", () => {
    const podium = rankPodium([
      score("Ava", 9),
      score("Zoe", 9),
      score("Cleo", 5),
      score("Dev", 4),
      score("Eli", 3),
    ]);
    const groups = podiumGroups(podium?.entries ?? []);
    expect(groups.map((g) => [g.place, g.tied, g.entries.length, g.step])).toEqual([
      [1, true, 2, 3],
      [3, false, 1, 2],
      [4, false, 1, 1],
      [5, false, 1, 0],
    ]);
  });
});

describe("parsePodium: what the stage accepts off the wire", () => {
  const good = { entries: [{ displayName: "Ava", points: 3, place: 1, tied: false }], more: 0 };

  it("accepts a podium and a null", () => {
    expect(parsePodium({ podium: good })).toEqual(good);
    expect(parsePodium({ podium: null })).toBeNull();
  });

  it("refuses anything else as no podium", () => {
    expect(parsePodium(null)).toBeNull();
    expect(parsePodium({ podium: { entries: "Ava" } })).toBeNull();
    expect(
      parsePodium({ podium: { ...good, entries: [{ ...good.entries[0], place: 0 }] } }),
    ).toBeNull();
    expect(parsePodium({ podium: { ...good, entries: [] } })).toBeNull();
  });
});
