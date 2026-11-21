// A phone in a bank session never loads the patient record's panel: it is its own chunk, fetched
// only when a case-study room renders the record's layout. The rooms import `LiveRecord.tsx` for
// `useShowLiveRecord`, so a static import of the panel there would put it on every phone.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { CaseStudyLayout } from "./CaseStudyLayout";
import "./StudentPacedRoom";
import "./StudentRoom";

const loaded = vi.hoisted(() => ({ panel: 0 }));
vi.mock("@/components/ehr/EhrPanel", async (importOriginal) => {
  loaded.panel += 1;
  return importOriginal();
});

describe("the patient record's panel is loaded only for a case study (#6)", () => {
  it("is not loaded by the rooms or by a bank session's layout", () => {
    render(
      <CaseStudyLayout record={null}>
        <p>Item 1 of 3</p>
      </CaseStudyLayout>,
    );
    expect(screen.getByText("Item 1 of 3")).toBeInTheDocument();
    expect(loaded.panel).toBe(0);
  });

  it("is loaded, and shown, for a case-study session", async () => {
    render(
      <CaseStudyLayout record={sampleEhr}>
        <p>Step 1 of 6</p>
      </CaseStudyLayout>,
    );
    expect(
      await screen.findByRole("complementary", { name: "Patient record" }),
    ).toBeInTheDocument();
    expect(loaded.panel).toBe(1);
  });
});
