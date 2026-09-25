import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    expect(
      screen.getByRole("heading", { level: 3, name: "No case studies in this bank yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Name one below/)).toBeInTheDocument();
  });

  it("says what the page passes when a folder holds no case studies", () => {
    render(
      <CaseStudyList
        caseStudies={[]}
        empty={{ heading: "No case studies in this folder", body: "Move one here." }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "No case studies in this folder" }),
    ).toBeInTheDocument();
  });

  it("lets each case study be selected for a move, outside its link, only with a move form", () => {
    const { rerender } = render(<CaseStudyList caseStudies={caseStudies} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    rerender(<CaseStudyList caseStudies={caseStudies} moveFormId="move-form" />);
    const sepsis = screen.getByRole("checkbox", { name: "Select Sepsis" });
    expect(sepsis).toHaveAttribute("form", "move-form");
    expect(sepsis).toHaveAttribute("name", "caseStudy");
    expect(sepsis).toHaveAttribute("value", "c2");
    expect(sepsis.closest("a")).toBeNull();
  });

  it("offers Restore on each archived case study, named for it, outside its link", () => {
    const archived = caseStudies.map((caseStudy) => ({
      ...caseStudy,
      status: "archived" as const,
    }));
    const restoreAction = vi.fn((id: string) => async () => {
      void id;
      return { status: "idle" as const };
    });
    render(<CaseStudyList caseStudies={archived} restoreAction={restoreAction} />);
    const restore = screen.getByRole("button", { name: "Restore Sepsis" });
    expect(restore.closest("a")).toBeNull();
    expect(
      within(screen.getByRole("link", { name: /Sepsis/ })).getByText("Archived"),
    ).toBeInTheDocument();
    expect(restoreAction).toHaveBeenCalledWith("c2");
  });
});
