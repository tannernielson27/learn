import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import { HostRecord } from "./HostRecord";

describe("HostRecord (#335)", () => {
  it("shows the instructor the whole staged record, marked with the class's step", () => {
    render(<HostRecord record={ehrRecordSchema.parse(stagedEhr)} position={2} />);
    expect(screen.getByTestId("host-record")).toHaveTextContent("Patient record· Step 2");
    expect(screen.getByTestId("record-note")).toHaveTextContent(
      "Full patient record. The class is on step 2, and phones show only what step 2 has reached.",
    );
    // The whole record: the labs, locked on a phone at step 2, are open here.
    const labs = screen.getByRole("tab", { name: "Lab Results", hidden: true });
    expect(labs).not.toHaveAttribute("aria-disabled");
  });

  it("is not there for a record nothing is held back from", () => {
    render(<HostRecord record={ehrRecordSchema.parse(sampleEhr)} position={2} />);
    expect(screen.queryByTestId("host-record")).toBeNull();
  });
});

describe("HostRecord in a quiz that plays case studies in place (#469)", () => {
  const staged = ehrRecordSchema.parse(stagedEhr);

  it("names the case study whose record it is", () => {
    render(<HostRecord record={staged} position={3} title="Ectopic pregnancy" />);
    expect(screen.getByTestId("host-record")).toHaveTextContent(
      "Patient record: Ectopic pregnancy· Step 3",
    );
  });

  it("in a student-paced room, marks no step: each phone is on its own", () => {
    render(<HostRecord record={staged} position={null} title="Ectopic pregnancy" paced />);
    expect(screen.getByTestId("host-record")).toHaveTextContent(
      /^Patient record: Ectopic pregnancy(?!·)/,
    );
    expect(screen.getByTestId("record-note")).toHaveTextContent(
      "Full patient record. Each phone shows only what the step on its screen has reached.",
    );
  });
});
