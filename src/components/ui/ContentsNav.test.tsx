import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CONTENTS_ANCHOR_OFFSET, ContentsNav, sectionNumber } from "./ContentsNav";

const ENTRIES = [
  { id: "scoring", title: "Scoring models" },
  {
    id: "formats",
    title: "Question formats",
    children: [
      { id: "bowtie", title: "Bowtie" },
      { id: "matrix", title: "Matrix" },
    ],
  },
];

describe("sectionNumber", () => {
  it("sets a section's number in two digits", () => {
    expect(sectionNumber(0)).toBe("01");
    expect(sectionNumber(9)).toBe("10");
  });
});

describe("ContentsNav", () => {
  it("is a navigation landmark named by its visible label, which is not a heading", () => {
    render(<ContentsNav label="On this page" labelId="otp" entries={ENTRIES} />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).queryByRole("heading")).toBeNull();
    expect(nav).toHaveClass("lg:sticky", "lg:top-8");
  });

  it("numbers each entry for the eye and links it to its section", () => {
    render(<ContentsNav label="Contents" labelId="c" entries={ENTRIES} />);
    const link = screen.getByRole("link", { name: "Scoring models" });
    expect(link).toHaveAttribute("href", "#scoring");
    expect(link).toHaveTextContent("01Scoring models");
    expect(link.querySelector("[aria-hidden='true']")).toHaveTextContent("01");
    expect(link).toHaveClass("tap-target");
  });

  it("lists the topics inside a section under it", () => {
    render(<ContentsNav label="Contents" labelId="c" entries={ENTRIES} />);
    expect(screen.getByRole("link", { name: "Bowtie" })).toHaveAttribute("href", "#bowtie");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("lands an anchor at the same offset the list is sticky at", () => {
    expect(CONTENTS_ANCHOR_OFFSET).toBe("scroll-mt-8");
  });
});
