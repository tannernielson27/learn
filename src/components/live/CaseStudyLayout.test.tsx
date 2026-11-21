import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { CaseStudyLayout } from "./CaseStudyLayout";

describe("CaseStudyLayout (#184)", () => {
  it("puts the patient record beside the room for a case-study session", async () => {
    render(
      <CaseStudyLayout record={sampleEhr}>
        <p>Step 1 of 6</p>
      </CaseStudyLayout>,
    );

    // The room is there at once; the panel is its own chunk, which a client-only render awaits.
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
    // The two-pane record and the phone's chip are both rendered; CSS shows one of them.
    expect(
      await screen.findByRole("complementary", { name: "Patient record" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Patient record" })).toBeInTheDocument();
    expect(screen.getAllByText(/Orthopedic unit/).length).toBeGreaterThan(0);
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByText("Step 1 of 6"));
  });

  it("is the narrow phone column it has always been when the session has no record", () => {
    render(
      <CaseStudyLayout record={null}>
        <p>Item 1 of 3</p>
      </CaseStudyLayout>,
    );

    expect(screen.queryByRole("complementary", { name: "Patient record" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Patient record" })).toBeNull();
    expect(screen.getByRole("main")).toHaveClass("max-w-lg");
    expect(screen.getByText("Item 1 of 3")).toBeInTheDocument();
  });
});

describe("CaseStudyLayout in a quiz that plays case studies in place (#469)", () => {
  it("is the record's layout from the start, with no chart until a step brings one", () => {
    render(
      <CaseStudyLayout record={null} changing>
        <p>Question 1 of 7</p>
      </CaseStudyLayout>,
    );
    expect(screen.queryByRole("complementary", { name: "Patient record" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Patient record" })).toBeNull();
    expect(screen.getByRole("main")).not.toHaveClass("max-w-lg");
    expect(screen.getByText("Question 1 of 7")).toBeInTheDocument();
  });
});
