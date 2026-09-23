import { describe, expect, it } from "vitest";
import { CONFORMANCE_CORRECT, CONFORMANCE_ITEMS } from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import type { StudentView } from "./participantTransport";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * `goto` (#183) through the Supabase adapter, for the two things the shared suite cannot ask: what
 * a phone sent back to an item it answered is shown, and what reaches its browser on the way.
 * The shared rules are in `roomConformanceGoto.ts`, which this adapter runs too.
 */
const [FIRST, SECOND] = CONFORMANCE_ITEMS as [Item, Item, Item];

function room(): FakeRoom {
  return createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-00000000cafe",
  });
}

/** A started room, one phone in it that has answered item 2, and the room since moved to 3. */
async function answeredSecondThenMoved() {
  const live = room();
  const host = live.host();
  await host.open();
  await host.start();
  await live.settle();
  const { participantId } = await live.participant().join(live.code, { displayName: "Ada" });
  await live.settle();
  // A resumed phone is a `SupabaseParticipant`, which is what a student's page holds.
  const ada = live.resuming(participantId);
  const views: StudentView[] = [];
  ada.onStudentView((view) => views.push(view));
  await ada.resume(live.identityOf(participantId));
  await host.goto(2);
  await live.settle();
  await ada.submit(SECOND.id, CONFORMANCE_CORRECT);
  await host.goto(3);
  await live.settle();
  return { live, host, ada, views };
}

describe("a phone sent back to an item (#183)", () => {
  it("sees the answer it already gave to that item, not a fresh item", async () => {
    const { live, host, views } = await answeredSecondThenMoved();
    expect(views.at(-1)?.answered).toBeNull();

    await host.goto(2);
    await live.settle();
    const back = views.at(-1);
    expect(back?.item?.id).toBe(SECOND.id);
    expect(back?.answered).toMatchObject({ itemId: SECOND.id, response: CONFORMANCE_CORRECT });
    expect(back?.revealed).toBeNull();
  });

  it("sees a fresh item when sent back to one it never answered", async () => {
    const { live, host, views } = await answeredSecondThenMoved();
    await host.goto(1);
    await live.settle();
    expect(views.at(-1)?.item?.id).toBe(FIRST.id);
    expect(views.at(-1)?.answered).toBeNull();
  });

  it("is sent no key on the way back to an item whose key was shown before", async () => {
    const { live, host } = await answeredSecondThenMoved();
    await host.goto(2);
    await host.reveal();
    await live.settle();
    // The control: the reveal did put the key on this browser's wire.
    expect(live.stack.wire.map((entry) => entry.body).join("\n")).toContain("answerKey");

    await host.goto(3);
    await live.settle();
    const seenBefore = live.stack.wire.length;
    await host.goto(2);
    await live.settle();
    const after = live.stack.wire.slice(seenBefore);
    // Going back reached the phone — and carried the item, but not its key.
    expect(after.some((entry) => entry.label === "POST /api/live/view")).toBe(true);
    const bytes = after.map((entry) => entry.body).join("\n");
    expect(bytes).toContain(SECOND.id);
    expect(bytes).not.toContain("answerKey");
    expect(bytes).not.toContain("rationale");
  });
});

describe("the guard trigger's stand-in (#183)", () => {
  it("refuses a position write in the lobby and out of range, and clears a reveal on a move", async () => {
    const live = room();
    const id = live.sessionId;
    expect(live.stack.updateSession(id, { current_position: 2 }).error).not.toBeNull();
    expect(
      live.stack.updateSession(id, { status: "running", current_position: 1 }).error,
    ).toBeNull();
    expect(live.stack.updateSession(id, { current_position: 4 }).error).not.toBeNull();
    expect(live.stack.updateSession(id, { current_position: null }).error).not.toBeNull();
    expect(live.stack.updateSession(id, { reveal: true }).error).toBeNull();
    expect(live.stack.updateSession(id, { current_position: 3 }).error).toBeNull();
    expect(live.stack.sessions[0]).toMatchObject({ current_position: 3, reveal: false });
  });
});
