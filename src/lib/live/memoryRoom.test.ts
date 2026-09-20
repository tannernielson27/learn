import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryRoom,
  initialSessionState,
  isLiveSessionError,
  toScoreReveal,
  type InMemoryRoom,
  type ItemAggregate,
  type ItemReveal,
  type LiveHostTransport,
  type LiveRefusal,
  type LiveSessionTransport,
  type Participant,
  type ParticipantItem,
  type SessionView,
} from "@/lib/live";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";

const first = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const second = itemSchema.parse(FIXTURES.multiple_choice.edge);
const third = itemSchema.parse(FIXTURES.multiple_response.canonical);
const ITEMS: Item[] = [first, second, third];

const CORRECT: AnyResponse = { type: "multiple_choice", optionId: "opt_a" };
const WRONG: AnyResponse = { type: "multiple_choice", optionId: "opt_c" };

/** The refusal code from a rejected transport call, so a test reads as one line. */
async function refusal(call: Promise<unknown>): Promise<LiveRefusal> {
  try {
    await call;
  } catch (error) {
    if (isLiveSessionError(error)) return error.code;
    throw error;
  }
  throw new Error("the call was not refused");
}

let clock = 1_000;
const now = () => (clock += 1);

function makeRoom(items: Item[] = ITEMS): InMemoryRoom {
  return createInMemoryRoom({ items, code: "LEARN7", sessionId: "s1", now });
}

async function joined(room: InMemoryRoom, displayName: string): Promise<LiveSessionTransport> {
  const transport = room.participant();
  await transport.join(room.code, { displayName });
  return transport;
}

async function openHost(room: InMemoryRoom): Promise<LiveHostTransport> {
  const host = room.host();
  await host.open();
  return host;
}

beforeEach(() => {
  clock = 1_000;
});

describe("joining", () => {
  it("answers with the session, the participant's own id and an empty room", async () => {
    const room = makeRoom();
    const snapshot = await room.participant().join("LEARN7", { displayName: "Ada" });
    expect(snapshot).toMatchObject({
      sessionId: "s1",
      code: "LEARN7",
      mode: "instructor_paced",
      participantId: "p1",
      item: null,
    });
    expect(snapshot.state.status).toBe("lobby");
    expect(snapshot.roster).toHaveLength(1);
  });

  it("forgives the spacing, hyphens and case a code is read out in", async () => {
    const room = makeRoom();
    await expect(
      room.participant().join(" lea-rn 7 ", { displayName: "Ada" }),
    ).resolves.toMatchObject({
      participantId: "p1",
    });
  });

  it("refuses a code that names no room", async () => {
    const room = makeRoom();
    expect(await refusal(room.participant().join("XYZ234", { displayName: "Ada" }))).toBe(
      "unknown_code",
    );
  });

  it("refuses to join a session that has ended", async () => {
    const room = makeRoom();
    await (await openHost(room)).end();
    expect(await refusal(room.participant().join("LEARN7", { displayName: "Ada" }))).toBe(
      "not_open",
    );
  });

  it("refuses a blank name and an unreasonably long one", async () => {
    const room = makeRoom();
    expect(await refusal(room.participant().join("LEARN7", { displayName: "   " }))).toBe(
      "no_name",
    );
    expect(await refusal(room.participant().join("LEARN7", { displayName: "n".repeat(61) }))).toBe(
      "name_too_long",
    );
  });

  it("is idempotent, so an effect that re-runs does not put a second name in the room", async () => {
    const room = makeRoom();
    const transport = room.participant();
    const one = await transport.join("LEARN7", { displayName: "Ada" });
    const two = await transport.join("LEARN7", { displayName: "Someone else" });
    expect(two.participantId).toBe(one.participantId);
    expect(two.roster).toHaveLength(1);
    expect(two.roster[0]?.displayName).toBe("Ada");
  });
});

describe("presence", () => {
  it("tells everyone who is in the room, oldest first", async () => {
    const room = makeRoom();
    const seen: Participant[][] = [];
    const watcher = room.participant();
    watcher.onPresence((roster) => seen.push(roster));
    await watcher.join("LEARN7", { displayName: "Ada" });
    await joined(room, "Grace");

    expect(seen.at(-1)?.map((p) => p.displayName)).toEqual(["Ada", "Grace"]);
  });

  it("drops a participant who leaves, and leaving twice is harmless", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    const rosters: Participant[][] = [];
    host.onPresence((roster) => rosters.push(roster));
    const ada = await joined(room, "Ada");
    await joined(room, "Grace");
    await ada.leave();
    await ada.leave();

    expect(rosters.at(-1)?.map((p) => p.displayName)).toEqual(["Grace"]);
  });

  it("stops sending a left participant anything", async () => {
    const room = makeRoom();
    const ada = await joined(room, "Ada");
    const views: SessionView[] = [];
    ada.onSessionState((view) => views.push(view));
    await ada.leave();
    await (await openHost(room)).start();
    expect(views).toHaveLength(0);
  });

  it("honours an unsubscribe", async () => {
    const room = makeRoom();
    const ada = await joined(room, "Ada");
    const views: SessionView[] = [];
    const stop = ada.onSessionState((view) => views.push(view));
    stop();
    stop();
    await (await openHost(room)).start();
    expect(views).toHaveLength(0);
  });
});

describe("what a participant is given", () => {
  it("never carries an answer key, a rationale or a scoring rule (ADR 0003)", async () => {
    const room = makeRoom();
    const ada = await joined(room, "Ada");
    const views: SessionView[] = [];
    ada.onSessionState((view) => views.push(view));
    await (await openHost(room)).start();

    const item = views.at(-1)?.item;
    expect(item?.id).toBe(first.id);
    expect(item).not.toHaveProperty("answerKey");
    expect(item).not.toHaveProperty("rationale");
    expect(item).not.toHaveProperty("scoring");
    // The option ids are content and belong there; the key that names one of them does not.
    expect(JSON.stringify(item)).not.toContain("correctOptionId");
  });

  it("will not compile if a host's view is put on a participant's channel", () => {
    const participantListener = (view: SessionView<ParticipantItem>) => view.item;
    const hostView: SessionView<Item> = { state: initialSessionState(1), item: first };
    // @ts-expect-error an item that still has an answerKey is not a ParticipantItem (ADR 0003).
    participantListener(hostView);
    // The keyless one is, so the branding refuses only what it should.
    const accepted = participantListener({
      state: initialSessionState(1),
      item: toKeylessItem(first),
    });
    expect(accepted).toMatchObject({ id: first.id });
  });

  it("gives the host the whole item, keys included", async () => {
    const room = makeRoom();
    const host = room.host();
    const snapshot = await host.open();
    expect(snapshot.item).toBeNull();
    await host.start();
    const after = await host.open();
    expect(after.item).toMatchObject({ id: first.id, answerKey: { correctOptionId: "opt_a" } });
  });
});

describe("submitting", () => {
  it("takes an answer to the item the room is on and stamps it with the session clock", async () => {
    const room = makeRoom();
    await (await openHost(room)).start();
    const ada = await joined(room, "Ada");
    const ack = await ada.submit(first.id, CORRECT);
    expect(ack.itemId).toBe(first.id);
    expect(ack.submittedAt).toBeGreaterThan(1_000);
  });

  it("returns nothing that could be an answer key", async () => {
    const room = makeRoom();
    await (await openHost(room)).start();
    const ada = await joined(room, "Ada");
    expect(Object.keys(await ada.submit(first.id, CORRECT)).sort()).toEqual([
      "itemId",
      "submittedAt",
    ]);
  });

  it("refuses an answer from someone who has not joined", async () => {
    const room = makeRoom();
    await (await openHost(room)).start();
    expect(await refusal(room.participant().submit(first.id, CORRECT))).toBe("not_joined");
  });

  it("refuses a second answer to the same item", async () => {
    const room = makeRoom();
    await (await openHost(room)).start();
    const ada = await joined(room, "Ada");
    await ada.submit(first.id, CORRECT);
    expect(await refusal(ada.submit(first.id, WRONG))).toBe("already_answered");
  });

  it("refuses an answer after the session ends", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    const ada = await joined(room, "Ada");
    await host.end();
    expect(await refusal(ada.submit(first.id, CORRECT))).toBe("not_open");
  });

  it("refuses an answer before the session starts, and while it is paused", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    const ada = await joined(room, "Ada");
    expect(await refusal(ada.submit(first.id, CORRECT))).toBe("not_started");
    await host.start();
    await host.pause();
    expect(await refusal(ada.submit(first.id, CORRECT))).toBe("paused");
  });

  it("refuses an answer once the key is showing", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    const ada = await joined(room, "Ada");
    await host.reveal();
    expect(await refusal(ada.submit(first.id, CORRECT))).toBe("already_revealed");
  });

  it("refuses an answer to an item the room has moved on from", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    const ada = await joined(room, "Ada");
    await host.advance();
    expect(await refusal(ada.submit(first.id, CORRECT))).toBe("wrong_item");
  });

  it("reads the answer the way a route handler does, and refuses one it cannot read", async () => {
    const room = makeRoom();
    await (await openHost(room)).start();
    const ada = await joined(room, "Ada");
    const nonsense = { type: "multiple_choice", optionId: 7 } as unknown as AnyResponse;
    expect(await refusal(ada.submit(first.id, nonsense))).toBe("malformed");
  });

  it("refuses an answer written for another item type", async () => {
    const room = makeRoom();
    await (await openHost(room)).start();
    const ada = await joined(room, "Ada");
    const wrongType: AnyResponse = { type: "multiple_response", optionIds: ["opt_a"] };
    expect(await refusal(ada.submit(first.id, wrongType))).toBe("wrong_type");
  });
});

describe("revealing", () => {
  it("hands each participant the key and their own marks", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    const ada = await joined(room, "Ada");
    const grace = await joined(room, "Grace");
    const adaSaw: ItemReveal[] = [];
    const graceSaw: ItemReveal[] = [];
    ada.onReveal((r) => adaSaw.push(r));
    grace.onReveal((r) => graceSaw.push(r));
    await ada.submit(first.id, CORRECT);
    await grace.submit(first.id, WRONG);

    // Nothing has been revealed yet, so nobody has heard anything.
    expect(adaSaw).toHaveLength(0);
    await host.reveal();

    expect(adaSaw).toHaveLength(1);
    expect(adaSaw[0]).toMatchObject({
      itemId: first.id,
      position: 1,
      reveal: { answerKey: { correctOptionId: "opt_a" } },
    });
    expect(adaSaw[0]?.score?.points).toBe(1);
    expect(graceSaw[0]?.score?.points).toBe(0);
  });

  it("gives someone who did not answer the key but no marks", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    const quiet = await joined(room, "Quiet");
    const seen: ItemReveal[] = [];
    quiet.onReveal((r) => seen.push(r));
    await host.reveal();
    expect(seen[0]?.score).toBeNull();
    expect(seen[0]?.reveal.answerKey).toEqual({ correctOptionId: "opt_a" });
  });

  it("makes a ScoreReveal the item player can take straight as initialReveal (#56)", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    const ada = await joined(room, "Ada");
    const seen: ItemReveal[] = [];
    ada.onReveal((r) => seen.push(r));
    await ada.submit(first.id, CORRECT);
    await host.reveal();

    const scoreReveal = toScoreReveal(seen[0] as ItemReveal);
    expect(scoreReveal).toMatchObject({
      score: { points: 1 },
      answerKey: { correctOptionId: "opt_a" },
    });
    expect(toScoreReveal({ ...(seen[0] as ItemReveal), score: null })).toBeNull();
  });

  it("says nothing to a room that is not on an item", async () => {
    const room = makeRoom([]);
    const host = await openHost(room);
    const ada = await joined(room, "Ada");
    const seen: ItemReveal[] = [];
    ada.onReveal((r) => seen.push(r));
    expect(await refusal(host.start())).toBe("empty_set");
    expect(seen).toHaveLength(0);
  });
});

describe("aggregates", () => {
  const aggregatesOf = async (room: InMemoryRoom) => {
    const host = await openHost(room);
    const seen: ItemAggregate[] = [];
    host.onAggregate((aggregate) => seen.push(aggregate));
    return { host, seen };
  };

  it("are pushed once per item change, never once per submission (ADR 0002)", async () => {
    const room = makeRoom();
    const { host, seen } = await aggregatesOf(room);
    await host.start();
    const people = await Promise.all(["A", "B", "C", "D", "E"].map((name) => joined(room, name)));
    for (const person of people) await person.submit(first.id, CORRECT);

    // Five answers, and the dashboard has heard nothing at all.
    expect(seen).toHaveLength(0);
    await host.reveal();
    expect(seen).toHaveLength(1);
    await host.advance();
    expect(seen).toHaveLength(2);
  });

  it("count how the marks fell for the item, not which option anyone chose", async () => {
    const room = makeRoom();
    const { host, seen } = await aggregatesOf(room);
    await host.start();
    const ada = await joined(room, "Ada");
    const grace = await joined(room, "Grace");
    await joined(room, "Quiet");
    await ada.submit(first.id, CORRECT);
    await grace.submit(first.id, WRONG);
    await host.reveal();

    expect(seen[0]).toEqual({
      itemId: first.id,
      position: 1,
      present: 3,
      responded: 2,
      fullMarks: 1,
      partialMarks: 0,
      noMarks: 1,
      meanPoints: 0.5,
      maxPoints: 1,
    });
    expect(JSON.stringify(seen[0])).not.toContain("opt_a");
  });

  it("counts partial marks apart from full and none", async () => {
    const room = makeRoom([third]);
    const { host, seen } = await aggregatesOf(room);
    await host.start();
    const partial = await joined(room, "Partial");
    const key = third.answerKey as { correctOptionIds: string[] };
    await partial.submit(third.id, {
      type: "multiple_response",
      optionIds: [key.correctOptionIds[0] as string],
    });
    await host.reveal();
    expect(seen[0]).toMatchObject({ fullMarks: 0, partialMarks: 1, noMarks: 0 });
  });

  it("carries the tally of the item the room has just left, and one more when it ends", async () => {
    const room = makeRoom();
    const { host, seen } = await aggregatesOf(room);
    await host.start();
    const ada = await joined(room, "Ada");
    await ada.submit(first.id, CORRECT);
    await host.advance();
    expect(seen).toEqual([expect.objectContaining({ position: 1, responded: 1 })]);
    await host.end();
    expect(seen.at(-1)).toMatchObject({ position: 2, responded: 0, meanPoints: 0 });
  });

  it("never report more answers than people, when someone answers and then drops out", async () => {
    const room = makeRoom();
    const { host, seen } = await aggregatesOf(room);
    await host.start();
    const ada = await joined(room, "Ada");
    await ada.submit(first.id, CORRECT);
    // A phone locks, a tab reloads: the answer stays, the person goes.
    await ada.leave();
    await host.reveal();
    expect(seen[0]).toMatchObject({ present: 1, responded: 1 });
  });

  it("say nothing when the room never reached an item", async () => {
    const room = makeRoom();
    const { host, seen } = await aggregatesOf(room);
    await host.end();
    expect(seen).toHaveLength(0);
  });

  it("are on the host's opening snapshot, and nowhere on a participant's", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    await host.start();
    expect((await host.open()).aggregate).toMatchObject({ position: 1, responded: 0 });
    const snapshot = await room.participant().join("LEARN7", { displayName: "Ada" });
    expect(snapshot).not.toHaveProperty("aggregate");
  });
});

describe("the host console", () => {
  it("rejects a refused command with the code to branch on", async () => {
    const room = makeRoom(ITEMS.slice(0, 1));
    const host = await openHost(room);
    await host.start();
    expect(await refusal(host.advance())).toBe("past_end");
    expect(await refusal(host.resume())).toBe("not_paused");
    await host.end();
    expect(await refusal(host.reveal())).toBe("not_open");
  });

  it("moves the room, and both sides hear about it", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    const hostViews: SessionView<Item>[] = [];
    host.onSessionState((view) => hostViews.push(view));
    const ada = await joined(room, "Ada");
    const adaViews: SessionView[] = [];
    ada.onSessionState((view) => adaViews.push(view));

    await host.start();
    await host.pause();
    await host.resume();
    await host.advance();

    expect(room.currentState()).toMatchObject({ status: "running", position: 2, reveal: false });
    expect(hostViews.map((v) => v.state.status)).toEqual([
      "running",
      "paused",
      "running",
      "running",
    ]);
    expect(adaViews).toHaveLength(4);
    expect(adaViews.at(-1)?.item?.id).toBe(second.id);
  });

  it("stops hearing anything once it closes, and closing twice is harmless", async () => {
    const room = makeRoom();
    const host = await openHost(room);
    const views: SessionView<Item>[] = [];
    host.onSessionState((view) => views.push(view));
    await host.close();
    await host.close();
    await (await openHost(room)).start();
    expect(views).toHaveLength(0);
  });

  it("lets a co-instructor open a second console on the same room", async () => {
    const room = makeRoom();
    const one = await openHost(room);
    const two = await openHost(room);
    const seen: SessionView<Item>[] = [];
    two.onSessionState((view) => seen.push(view));
    await one.start();
    expect(seen.at(-1)?.state.position).toBe(1);
  });
});

describe("the room itself", () => {
  it("takes a clock, so nothing depends on wall time", async () => {
    const tick = vi.fn(() => 42);
    const room = createInMemoryRoom({ items: ITEMS, now: tick });
    await (await openHost(room)).start();
    const ada = await joined(room, "Ada");
    expect((await ada.submit(first.id, CORRECT)).submittedAt).toBe(42);
    expect(tick).toHaveBeenCalled();
  });

  it("defaults its code, id and mode", () => {
    const room = createInMemoryRoom({ items: ITEMS });
    expect(room.code).toBe("LEARN7");
    expect(room.sessionId).toBe("in-memory-session");
    expect(room.mode).toBe("instructor_paced");
  });

  it("takes the mode it is given", () => {
    expect(createInMemoryRoom({ items: ITEMS, mode: "student_paced" }).mode).toBe("student_paced");
  });

  it("copies the items it is handed, so a later push does not change the set", () => {
    const items = [...ITEMS];
    const room = createInMemoryRoom({ items });
    items.push(first);
    expect(room.currentState().itemCount).toBe(3);
  });
});
