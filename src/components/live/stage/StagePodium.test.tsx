import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rankPodium, type PodiumScore } from "@/lib/live/podium";
import { StagePodium } from "./StagePodium";

const score = (displayName: string, points: number): PodiumScore => ({
  participantId: `p-${displayName}`,
  displayName,
  points,
});

const SUMMARY = { questionsRun: 6, itemCount: 6, joined: 68 };

function podiumOf(scores: PodiumScore[]) {
  const podium = rankPodium(scores);
  if (podium === null) throw new Error("no podium");
  return podium;
}

const FIVE = podiumOf([
  score("Ava", 9),
  score("Ben", 7),
  score("Cleo", 5),
  score("Dev", 3),
  score("Eli", 1),
]);

const reduceMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: reduce && media.includes("prefers-reduced-motion"),
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

afterEach(() => vi.unstubAllGlobals());

/** Each place's turn in the reveal, read off the elements that carry it. */
const stepsByPlace = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-place]")).map((el) => [
    Number(el.dataset.place),
    el.style.getPropertyValue("--podium-step"),
  ]);

describe("StagePodium", () => {
  it("names the top 5 with their points, best first for a screen reader", () => {
    reduceMotion(false);
    render(<StagePodium title="Cardiac week 3" podium={FIVE} summary={SUMMARY} rate={92} />);
    expect(screen.getByRole("heading", { name: "Top 5" })).toBeInTheDocument();
    const places = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(places[0]).toMatch(/1st.*Ava.*9 points/);
    expect(places.at(-1)).toMatch(/5th.*Eli.*1 point$/);
  });

  it("reveals from the bottom up: 5th, then 4th, 3rd, 2nd, and 1st last", () => {
    reduceMotion(false);
    render(<StagePodium title="Cardiac week 3" podium={FIVE} summary={SUMMARY} rate={null} />);
    expect(stepsByPlace()).toEqual([
      [1, "4"],
      [2, "3"],
      [3, "2"],
      [4, "1"],
      [5, "0"],
    ]);
    for (const el of document.querySelectorAll("[data-place]")) {
      expect(el).toHaveClass("motion-podium");
    }
  });

  it("puts 1st in the middle, 2nd on the left and 3rd on the right, tallest in the middle", () => {
    reduceMotion(false);
    render(<StagePodium title="Cardiac week 3" podium={FIVE} summary={SUMMARY} rate={null} />);
    const column = (place: number) => document.querySelector(`[data-place="${place}"]`);
    expect(column(1)).toHaveClass("col-start-2");
    expect(column(2)).toHaveClass("col-start-1");
    expect(column(3)).toHaveClass("col-start-3");
  });

  it("shows everything at once, with no motion, under reduced motion", () => {
    reduceMotion(true);
    render(<StagePodium title="Cardiac week 3" podium={FIVE} summary={SUMMARY} rate={null} />);
    for (const el of document.querySelectorAll<HTMLElement>("[data-place]")) {
      expect(el).not.toHaveClass("motion-podium");
      expect(el.style.getPropertyValue("--podium-step")).toBe("");
    }
    expect(screen.getByText("Ava")).toBeVisible();
  });

  it("shows a shared place once, with every name under it and the word tied", () => {
    reduceMotion(false);
    const podium = podiumOf([score("Zoe", 8), score("Ava", 8), score("Cleo", 5)]);
    render(<StagePodium title="T" podium={podium} summary={SUMMARY} rate={null} />);
    const first = document.querySelector<HTMLElement>('[data-place="1"]');
    expect(first).not.toBeNull();
    expect(first).toHaveTextContent(/^1st, tied/);
    expect(
      within(first as HTMLElement)
        .getAllByTestId("podium-name")
        .map((n) => n.textContent),
    ).toEqual(["Ava", "Zoe"]);
    // 2nd is skipped: Cleo is 3rd, on the next block.
    expect(document.querySelector('[data-place="3"]')).toHaveTextContent("Cleo");
    expect(document.querySelector('[data-place="2"]')).toBeNull();
  });

  it("never puts 4th on a block, even when fewer than three places are above it", () => {
    reduceMotion(false);
    const podium = podiumOf([
      score("Ava", 9),
      score("Zoe", 9),
      score("Cleo", 9),
      score("Dev", 6),
      score("Hal", 6),
    ]);
    render(<StagePodium title="T" podium={podium} summary={SUMMARY} rate={null} />);
    expect(document.querySelector('[data-place="1"]')).toHaveClass("col-start-2");
    const fourth = document.querySelector('[data-place="4"]');
    expect(fourth).toHaveClass("col-span-3");
    expect(fourth).toHaveTextContent(/^4th, tied/);
  });

  it("counts the rest of a large tie instead of naming them", () => {
    reduceMotion(false);
    const names = ["Ava", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo"];
    const podium = podiumOf(names.map((name) => score(name, 4)));
    render(<StagePodium title="T" podium={podium} summary={SUMMARY} rate={null} />);
    expect(screen.getAllByTestId("podium-name")).toHaveLength(8);
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
  });

  it("renders a display name as text, never as markup", () => {
    reduceMotion(false);
    const name = `<img src=x onerror="alert(1)">`;
    render(
      <StagePodium title="T" podium={podiumOf([score(name, 2)])} summary={SUMMARY} rate={null} />,
    );
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("keeps the session summary below the podium", () => {
    reduceMotion(false);
    render(<StagePodium title="Cardiac week 3" podium={FIVE} summary={SUMMARY} rate={92} />);
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
    expect(screen.getByText("Cardiac week 3")).toBeInTheDocument();
    const summary = screen.getByTestId("podium-summary");
    expect(summary).toHaveTextContent(/questions\s*6/);
    expect(summary).toHaveTextContent(/in this session\s*68/);
    expect(summary).toHaveTextContent(/of answers sent\s*92%/);
  });

  it("never says winner", () => {
    reduceMotion(false);
    render(<StagePodium title="T" podium={FIVE} summary={SUMMARY} rate={null} />);
    expect(document.body.textContent).not.toMatch(/winner/i);
  });
});
