import type { PodiumScore } from "./podium";

/**
 * Class totals for the end-of-session podium, for the gallery and its screenshots. Fictional
 * names, and totals as the report adds them up (+/- already floored at zero per question).
 */
const scores = (rows: readonly (readonly [string, number])[]): PodiumScore[] =>
  rows.map(([displayName, points], index) => ({
    participantId: `p-${index + 1}`,
    displayName,
    points,
  }));

export const PODIUM_FIXTURES: { name: string; label: string; scores: PodiumScore[] }[] = [
  {
    name: "five-places",
    label: "Five places",
    scores: scores([
      ["Marisol Okonkwo-Fitzgerald", 14],
      ["Ben T.", 12],
      ["Cleo", 11],
      ["Dev Patel", 9],
      ["Eli", 7.5],
      ["Fay", 6],
      ["Gus", 2],
    ]),
  },
  {
    name: "ties",
    label: "Tied at 1st and at 4th",
    scores: scores([
      ["Zoë Adeyemi", 12],
      ["Ava Brennan", 12],
      ["Cleo", 9],
      ["Hal", 6],
      ["Dev Patel", 6],
      ["Ivy", 3],
    ]),
  },
  {
    name: "large-tie",
    label: "More than eight tied",
    scores: scores([
      ["Ava", 10],
      ["Ben", 8],
      ["Cleo", 8],
      ["Dev", 8],
      ["Eli", 8],
      ["Fay", 8],
      ["Gus", 8],
      ["Hal", 8],
      ["Ivy", 8],
      ["Jo", 8],
      ["Kai", 8],
    ]),
  },
];
