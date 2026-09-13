import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseStudyList } from "./CaseStudyList";

const caseStudies = [
  {
    id: "c1",
    title: "Post-operative day two",
    status: "draft" as const,
    stepCount: 0,
    updatedAt: "2026-09-13T15:00:00Z",
  },
  {
    id: "c2",
    title: "Sepsis",
    status: "published" as const,
    stepCount: 6,
    updatedAt: "2026-09-12T08:00:00Z",
  },
];

describe("CaseStudyList", () => {
  it("links each case study to its page with status and how many steps are placed", () => {
    render(<CaseStudyList caseStudies={caseStudies} />);
    const first = screen.getByRole("link", { name: /Post-operative day two/ });
    expect(first).toHaveAttribute("href", "/author/case-studies/c1");
    expect(within(first).getByText("Draft")).toBeInTheDocument();
    expect(within(first).getByText("0 of 6 steps")).toBeInTheDocument();
    const second = screen.getByRole("link", { name: /Sepsis/ });
    expect(within(second).getByText("Published")).toBeInTheDocument();
    expect(within(second).getByText("6 of 6 steps")).toBeInTheDocument();
  });

  it("names the list, so it can be told apart from the item list", () => {
    render(<CaseStudyList caseStudies={caseStudies} />);
    expect(screen.getByRole("list", { name: "Case studies" })).toBeInTheDocument();
  });

  it("says when the bank has no case studies", () => {
    render(<CaseStudyList caseStudies={[]} />);
    expect(screen.getByText("No case studies in this bank yet.")).toBeInTheDocument();
  });
});
