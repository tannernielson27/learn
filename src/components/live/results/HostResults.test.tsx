import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { distributionFor, type Distribution } from "@/lib/live/results";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { HostResults } from "./HostResults";

const SESSION_ID = "00000000-0000-4000-8000-000000000180";

const item = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item & {
  type: "multiple_response";
};
const [first, second] = item.content.options;
const answered = (count: number): Distribution =>
  distributionFor(
    item,
    Array.from({ length: count }, () => ({
      type: "multiple_response",
      optionIds: [first?.id, second?.id],
    })),
  );

function setup(over: Partial<Parameters<typeof HostResults>[0]> = {}) {
  let next: Distribution | null = answered(1);
  const ask = vi.fn(async () => next);
  const props = {
    sessionId: SESSION_ID,
    ask,
    position: 1,
    revealed: false,
    active: true,
    intervalMs: 1_000,
    ...over,
  };
  const view = render(<HostResults {...props} />);
  return {
    ask,
    props,
    view,
    answersIn: (value: Distribution | null) => {
      next = value;
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HostResults (#180)", () => {
  it("shows how the room answered the item it is on", async () => {
    setup();
    expect(await screen.findByRole("list", { name: "Options" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Results" })).toBeInTheDocument();
  });

  it("asks again on the tally's cadence, and draws the newer count", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { ask, answersIn } = setup();
    await screen.findByText("1 answer counted");
    answersIn(answered(3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(await screen.findByText("3 answers counted")).toBeInTheDocument();
    expect(ask.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("asks for nothing while the room is on no item", async () => {
    const { ask } = setup({ active: false, position: null });
    await act(async () => {});
    expect(ask).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Results" })).toBeNull();
  });

  it("drops results that are about an item the room has left", async () => {
    const { view, props, answersIn } = setup();
    await screen.findByText("1 answer counted");
    answersIn(null);
    view.rerender(<HostResults {...props} position={2} />);
    await waitFor(() => expect(screen.queryByText("1 answer counted")).toBeNull());
  });

  it("marks the correct options only once the answer is showing", async () => {
    const { view, props } = setup();
    await screen.findByText("1 answer counted");
    expect(screen.queryAllByTestId("result-correct")).toHaveLength(0);
    view.rerender(<HostResults {...props} revealed />);
    await waitFor(() => expect(screen.getAllByTestId("result-correct").length).toBeGreaterThan(0));
  });

  it("hides the tallies on request, and remembers it for this session", async () => {
    const user = userEvent.setup();
    const { view } = setup();
    await screen.findByText("1 answer counted");

    await user.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByText("1 answer counted")).toBeNull();
    expect(screen.getByText(/Results are hidden/)).toBeInTheDocument();

    // A reload of the console keeps them hidden.
    view.unmount();
    setup();
    expect(await screen.findByRole("button", { name: "Show results" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Options" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByRole("list", { name: "Options" })).toBeInTheDocument();
  });

  it("still toggles when the browser refuses storage", async () => {
    const user = userEvent.setup();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      setup({ sessionId: "00000000-0000-4000-8000-0000000001ff" });
      await screen.findByText("1 answer counted");
      await user.click(screen.getByRole("button", { name: "Hide results" }));
      expect(screen.getByRole("button", { name: "Show results" })).toBeInTheDocument();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("says so while nobody has answered yet", async () => {
    render(
      <HostResults
        sessionId={SESSION_ID}
        ask={async () => answered(0)}
        position={1}
        revealed={false}
        active
        intervalMs={1_000}
      />,
    );
    expect(await screen.findByText("0 answers counted")).toBeInTheDocument();
    expect(screen.getAllByText("0 of 0 · 0%").length).toBeGreaterThan(0);
  });

  it("keeps quiet when an ask fails, rather than erroring on a projector", async () => {
    const ask = vi.fn(async () => {
      throw new Error("offline");
    });
    render(
      <HostResults
        sessionId={SESSION_ID}
        ask={ask}
        position={1}
        revealed={false}
        active
        intervalMs={1_000}
      />,
    );
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Results appear here/)).toBeInTheDocument();
  });
});
