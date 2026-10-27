import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LiveSessionState, ParticipantItem, SubmitAck } from "@/lib/live";
import { LiveSessionError, NO_TIMER } from "@/lib/live";
import type { StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { LIVE_BUSY_LABEL } from "./liveSubmit";
import { StudentRoom } from "./StudentRoom";

/**
 * A late answer and "Add time" crossing on the wire: the server refuses the answer as late
 * against the old end, and the room's new end reaches the phone before that refusal does.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical);
const KEYLESS = toKeylessItem(SATA) as ParticipantItem;

const timed = (endsAt: number): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 3,
  reveal: false,
  timer: { ...NO_TIMER, seconds: 30, endsAt, remainingMs: null },
});

describe("StudentRoom: a late refusal that lands after the teacher added time", () => {
  it("does not leave the student on Sending your answer", async () => {
    let push: (view: StudentView) => void = () => {};
    let refuse: (error: unknown) => void = () => {};
    const submit = vi.fn<(itemId: string, response: AnyResponse) => Promise<SubmitAck>>(
      () =>
        new Promise<SubmitAck>((_, no) => {
          refuse = no;
        }),
    );
    const transport = {
      resume: async () => ({
        state: timed(Date.now() + 1_000),
        item: null,
        answered: null,
        revealed: null,
      }),
      leave: async () => {},
      onStudentView: (listener: typeof push) => {
        push = listener;
        return () => {};
      },
      onCount: () => () => {},
      onConnection: () => () => {},
      submit,
      serverNow: () => Date.now(),
    } as unknown as SupabaseParticipant;
    render(
      <StudentRoom
        sessionId="00000000-0000-4000-8000-00000000f001"
        title="Cardiac basics"
        displayName="Sam Okafor"
        participantId="00000000-0000-4000-8000-00000000f002"
        joinedAt={1000}
        initial={timed(Date.now() + 1_000)}
        channel={{ token: "channel-token", expiresAt: 0 }}
        connect={() => transport}
      />,
    );
    const view = (state: LiveSessionState) =>
      act(() => push({ state, item: KEYLESS, answered: null, revealed: null }));

    view(timed(Date.now() + 1_000));
    await renderersLoaded();
    fireEvent.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Submit$/ })));
    expect(screen.getByRole("button", { name: LIVE_BUSY_LABEL })).toBeInTheDocument();

    // "Add 30 seconds" arrives over the socket; then the refusal, made against the old end.
    view(timed(Date.now() + 30_000));
    await act(async () => refuse(new LiveSessionError("time_up")));

    expect(screen.queryByRole("button", { name: LIVE_BUSY_LABEL })).toBeNull();
    // The clock has time on it again, so the student can send the answer they still have.
    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeEnabled();
  });
});
