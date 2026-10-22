import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { recordAtStep, type EhrRecordView } from "@/lib/ngn/chartReveal";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import { LiveRecordLayout, useShowLiveRecord } from "./LiveRecord";

const staged = ehrRecordSchema.parse(stagedEhr);

const held: { show: ((record: EhrRecordView | null) => void) | null } = { show: null };
function Room() {
  const setter = useShowLiveRecord();
  useEffect(() => {
    held.show = setter;
  }, [setter]);
  return <p>room</p>;
}
const show = (record: EhrRecordView | null) => held.show?.(record);

describe("LiveRecordLayout (#335)", () => {
  it("shows the server's chart, then each chart the room hands it, with no reload", async () => {
    render(
      <LiveRecordLayout initial={recordAtStep(staged, 2)}>
        <Room />
      </LiveRecordLayout>,
    );
    const labs = () =>
      screen.getAllByRole("tab", { name: /^Lab Results/, hidden: true })[0] as HTMLElement;
    expect(labs()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/0130: Pale/)).toBeNull();

    act(() => show(recordAtStep(staged, 3)));
    expect(labs()).not.toHaveAttribute("aria-disabled");
    await userEvent.click(labs());
    expect(screen.getAllByText(/Serum hCG/).length).toBeGreaterThan(0);
  });

  it("puts the chart away and brings another back without remounting the room (#469)", () => {
    const mounts = { count: 0 };
    function Counted() {
      useEffect(() => {
        mounts.count += 1;
      }, []);
      return <Room />;
    }
    render(
      <LiveRecordLayout initial={null}>
        <Counted />
      </LiveRecordLayout>,
    );
    const chart = () => screen.queryByRole("complementary", { name: "Patient record" });
    expect(chart()).toBeNull();
    act(() => show(recordAtStep(staged, 1)));
    expect(chart()).toBeInTheDocument();
    act(() => show(null));
    expect(chart()).toBeNull();
    expect(screen.getByText("room")).toBeInTheDocument();
    expect(mounts.count).toBe(1);
  });

  it("is not there outside a case-study room", () => {
    render(<Room />);
    expect(held.show).toBeNull();
  });
});
