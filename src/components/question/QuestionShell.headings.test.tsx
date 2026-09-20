// Every player context (gallery, case study, authoring preview, play from the bank) puts the item
// under a level-2 heading, so a renderer's own level-3 headings, such as the bowtie's column
// names, never skip a level after the page's h1.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { bowtieItemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";

const bowtie = bowtieItemSchema.parse(FIXTURES.bowtie.canonical);

describe("QuestionShell headings", () => {
  it("names the question region with a level-2 heading", () => {
    render(<ItemPlayer item={bowtie} submit={scoreInProcess(bowtie)} />);
    const region = screen.getByRole("region", { name: "Question" });
    expect(within(region).getByRole("heading", { level: 2, name: "Question" })).toBeInTheDocument();
  });

  it("places the bowtie's level-3 column headings after that level-2 heading", () => {
    render(<ItemPlayer item={bowtie} submit={scoreInProcess(bowtie)} />);
    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));
    expect(levels[0]).toBe(2);
    expect(levels.slice(1).every((level) => level >= 2 && level <= 3)).toBe(true);
  });
});
