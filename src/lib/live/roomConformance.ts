/**
 * The conformance suite every `LiveSessionTransport` adapter has to pass (#130, #131, ADR 0002).
 *
 * ADR 0002 ships two adapters and promises the UI cannot tell them apart. #131's acceptance
 * criterion says that in the only way that can be checked: *every test that passes against the
 * in-memory adapter passes against the Supabase one, from the same suite.* So the tests live here,
 * once, and each adapter's own spec file calls `describeRoomConformance` with a factory. A rule
 * that exists in one adapter's tests and not the other's is a rule the interface does not really
 * have; putting them in one file is what stops that happening again.
 *
 * What an adapter must supply is a `ConformanceRoom`: a room with its items already loaded, a way
 * to read the state for an assertion, a participant connection, a host console, and `settle()` —
 * the one concession to adapters whose messages travel. In process, `settle` is a no-op; over a
 * channel it drains whatever is in flight, so the suite never sprinkles timeouts around.
 *
 * Pure TypeScript: no React, Next or Supabase. It imports `vitest`, which is a dev dependency and
 * reaches no bundle — nothing in `src/app` or `src/components` imports this file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { isLiveSessionError, type LiveRefusal } from "./errors";
import type { LiveSessionState, SessionMode } from "./state";
import type {
  ItemAggregate,
  ItemReveal,
  LiveHostTransport,
  LiveSessionTransport,
  Participant,
  ParticipantItem,
  SessionView,
} from "./transport";
import { toScoreReveal } from "./transport";

/** A room under test, however it is built. The suite knows nothing else about an adapter. */
export interface ConformanceRoom {
  readonly sessionId: string;
  readonly code: string;
  readonly mode: SessionMode;
  /** The state as it stands, for assertions. Connections learn it through their subscriptions. */
  currentState(): Promise<LiveSessionState>;
  /** A participant's connection. One per client; it holds no key at any point. */
  participant(): LiveSessionTransport;
  /** The host's console connection. More than one is fine: co-instructors share a room. */
  host(): LiveHostTransport;
  /**
   * Waits until everything this room has in flight has been delivered. A no-op for an adapter that
   * emits in process; for one with a channel it is the difference between a suite that reads as
   * prose and a suite full of sleeps.
   */
  settle(): Promise<void>;
  /** Drops the room. Called after every test, whether it passed or not. */
  dispose(): Promise<void>;
}

export interface ConformanceRoomOptions {
  items: readonly Item[];
  code: string;
  sessionId: string;
}

export type ConformanceRoomFactory = (
  options: ConformanceRoomOptions,
) => ConformanceRoom | Promise<ConformanceRoom>;

export const CONFORMANCE_ITEMS: Item[] = [
  itemSchema.parse(FIXTURES.multiple_choice.canonical),
  itemSchema.parse(FIXTURES.multiple_choice.edge),
  itemSchema.parse(FIXTURES.multiple_response.canonical),
];

const [FIRST, SECOND, THIRD] = CONFORMANCE_ITEMS as [Item, Item, Item];

export const CONFORMANCE_CORRECT: AnyResponse = { type: "multiple_choice", optionId: "opt_a" };
export const CONFORMANCE_WRONG: AnyResponse = { type: "multiple_choice", optionId: "opt_c" };

/** The refusal code from a rejected transport call, so a test reads as one line. */
export async function refusalOf(call: Promise<unknown>): Promise<LiveRefusal> {
  try {
    await call;
  } catch (error) {
    if (isLiveSessionError(error)) return error.code;
    throw error;
  }
  throw new Error("the call was not refused");
}

/**
 * Registers the whole suite against one adapter. Call it from that adapter's own spec file; the
 * `adapter` string is what tells the two runs apart in the reporter.
 */
export function describeRoomConformance(adapter: string, createRoom: ConformanceRoomFactory): void {
  const open: ConformanceRoom[] = [];

  async function makeRoom(items: readonly Item[] = CONFORMANCE_ITEMS): Promise<ConformanceRoom> {
    // A uuid, because an adapter over a real schema has uuid session ids and #129's participant
    // cookie is `<session uuid>.<participant uuid>.<secret>` — a made-up "s1" would be refused by
    // the shape check before any adapter was asked anything.
    const room = await createRoom({
      items,
      code: "LEARN7",
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    open.push(room);
    return room;
  }

  async function joined(room: ConformanceRoom, displayName: string): Promise<LiveSessionTransport> {
    const transport = room.participant();
    await transport.join(room.code, { displayName });
    await room.settle();
    return transport;
  }

  async function openHost(room: ConformanceRoom): Promise<LiveHostTransport> {
    const host = room.host();
    await host.open();
    await room.settle();
    return host;
  }

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  describe(`${adapter}: joining`, () => {
    it("answers with the session, the participant's own id and an empty room", async () => {
      const room = await makeRoom();
      const snapshot = await room.participant().join("LEARN7", { displayName: "Ada" });
      expect(snapshot).toMatchObject({
        sessionId: room.sessionId,
        code: "LEARN7",
        mode: "instructor_paced",
        item: null,
      });
      expect(snapshot.participantId).not.toBe("");
      expect(snapshot.state.status).toBe("lobby");
      await room.settle();
      expect(snapshot.roster).toHaveLength(1);
    });

    it("forgives the spacing, hyphens and case a code is read out in", async () => {
      const room = await makeRoom();
      const snapshot = await room.participant().join(" lea-rn 7 ", { displayName: "Ada" });
      expect(snapshot.sessionId).toBe(room.sessionId);
    });

    it("refuses a code that names no room", async () => {
      const room = await makeRoom();
      expect(await refusalOf(room.participant().join("XYZ234", { displayName: "Ada" }))).toBe(
        "unknown_code",
      );
    });

    it("refuses to join a session that has ended", async () => {
      const room = await makeRoom();
      await (await openHost(room)).end();
      await room.settle();
      expect(await refusalOf(room.participant().join("LEARN7", { displayName: "Ada" }))).toBe(
        "not_open",
      );
    });

    it("refuses a blank name and an unreasonably long one", async () => {
      const room = await makeRoom();
      expect(await refusalOf(room.participant().join("LEARN7", { displayName: "   " }))).toBe(
        "no_name",
      );
      expect(
        await refusalOf(room.participant().join("LEARN7", { displayName: "n".repeat(61) })),
      ).toBe("name_too_long");
    });

    it("is idempotent, so an effect that re-runs does not put a second name in the room", async () => {
      const room = await makeRoom();
      const transport = room.participant();
      const one = await transport.join("LEARN7", { displayName: "Ada" });
      const two = await transport.join("LEARN7", { displayName: "Someone else" });
      await room.settle();
      expect(two.participantId).toBe(one.participantId);
      expect(two.roster).toHaveLength(1);
      expect(two.roster[0]?.displayName).toBe("Ada");
    });
  });

  describe(`${adapter}: presence`, () => {
    it("tells everyone who is in the room, oldest first", async () => {
      const room = await makeRoom();
      const seen: Participant[][] = [];
      const watcher = room.participant();
      watcher.onPresence((roster) => seen.push(roster));
      await watcher.join("LEARN7", { displayName: "Ada" });
      await joined(room, "Grace");
      await room.settle();

      expect(seen.at(-1)?.map((p) => p.displayName)).toEqual(["Ada", "Grace"]);
    });

    it("drops a participant who leaves, and leaving twice is harmless", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const rosters: Participant[][] = [];
      host.onPresence((roster) => rosters.push(roster));
      const ada = await joined(room, "Ada");
      await joined(room, "Grace");
      await ada.leave();
      await ada.leave();
      await room.settle();

      expect(rosters.at(-1)?.map((p) => p.displayName)).toEqual(["Grace"]);
    });

    it("stops sending a left participant anything", async () => {
      const room = await makeRoom();
      const ada = await joined(room, "Ada");
      const views: SessionView<ParticipantItem>[] = [];
      ada.onSessionState((view) => views.push(view));
      await ada.leave();
      await (await openHost(room)).start();
      await room.settle();
      expect(views).toHaveLength(0);
    });

    it("honours an unsubscribe", async () => {
      const room = await makeRoom();
      const ada = await joined(room, "Ada");
      const views: SessionView<ParticipantItem>[] = [];
      const stop = ada.onSessionState((view) => views.push(view));
      stop();
      stop();
      await (await openHost(room)).start();
      await room.settle();
      expect(views).toHaveLength(0);
    });
  });

  describe(`${adapter}: what a participant is given`, () => {
    it("never carries an answer key, a rationale or a scoring rule (ADR 0003)", async () => {
      const room = await makeRoom();
      const ada = await joined(room, "Ada");
      const views: SessionView<ParticipantItem>[] = [];
      ada.onSessionState((view) => views.push(view));
      await (await openHost(room)).start();
      await room.settle();

      const item = views.at(-1)?.item;
      expect(item?.id).toBe(FIRST.id);
      expect(item).not.toHaveProperty("answerKey");
      expect(item).not.toHaveProperty("rationale");
      expect(item).not.toHaveProperty("scoring");
      // The option ids are content and belong there; the key that names one of them does not.
      expect(JSON.stringify(item)).not.toContain("correctOptionId");
    });

    it("gives the host the whole item, keys included", async () => {
      const room = await makeRoom();
      const host = room.host();
      const snapshot = await host.open();
      expect(snapshot.item).toBeNull();
      await host.start();
      await room.settle();
      const after = await host.open();
      expect(after.item).toMatchObject({ id: FIRST.id, answerKey: { correctOptionId: "opt_a" } });
    });
  });

  describe(`${adapter}: submitting`, () => {
    it("takes an answer to the item the room is on and stamps it with the session clock", async () => {
      const room = await makeRoom();
      await (await openHost(room)).start();
      const ada = await joined(room, "Ada");
      const ack = await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      expect(ack.itemId).toBe(FIRST.id);
      // Not zero, and not a default: every adapter's clock — an injected one in memory, `now()`
      // in Postgres — is past this, and a stamp of 0 or NaN would not be.
      expect(ack.submittedAt).toBeGreaterThan(1_000);
    });

    it("returns nothing that could be an answer key", async () => {
      const room = await makeRoom();
      await (await openHost(room)).start();
      const ada = await joined(room, "Ada");
      expect(Object.keys(await ada.submit(FIRST.id, CONFORMANCE_CORRECT)).sort()).toEqual([
        "itemId",
        "submittedAt",
      ]);
    });

    it("refuses an answer from someone who has not joined", async () => {
      const room = await makeRoom();
      await (await openHost(room)).start();
      expect(await refusalOf(room.participant().submit(FIRST.id, CONFORMANCE_CORRECT))).toBe(
        "not_joined",
      );
    });

    it("refuses a second answer to the same item", async () => {
      const room = await makeRoom();
      await (await openHost(room)).start();
      const ada = await joined(room, "Ada");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_WRONG))).toBe("already_answered");
    });

    it("refuses an answer after the session ends", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      await host.end();
      await room.settle();
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("not_open");
    });

    it("refuses an answer before the session starts, and while it is paused", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const ada = await joined(room, "Ada");
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("not_started");
      await host.start();
      await host.pause();
      await room.settle();
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("paused");
    });

    it("refuses an answer once the key is showing", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      await host.reveal();
      await room.settle();
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("already_revealed");
    });

    it("refuses an answer to an item the room has moved on from", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      await host.advance();
      await room.settle();
      expect(await refusalOf(ada.submit(FIRST.id, CONFORMANCE_CORRECT))).toBe("wrong_item");
    });

    it("reads the answer the way a route handler does, and refuses one it cannot read", async () => {
      const room = await makeRoom();
      await (await openHost(room)).start();
      const ada = await joined(room, "Ada");
      const nonsense = { type: "multiple_choice", optionId: 7 } as unknown as AnyResponse;
      expect(await refusalOf(ada.submit(FIRST.id, nonsense))).toBe("malformed");
    });

    it("refuses an answer written for another item type", async () => {
      const room = await makeRoom();
      await (await openHost(room)).start();
      const ada = await joined(room, "Ada");
      const wrongType: AnyResponse = { type: "multiple_response", optionIds: ["opt_a"] };
      expect(await refusalOf(ada.submit(FIRST.id, wrongType))).toBe("wrong_type");
    });
  });

  describe(`${adapter}: revealing`, () => {
    it("hands each participant the key and their own marks", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      const adaSaw: ItemReveal[] = [];
      const graceSaw: ItemReveal[] = [];
      ada.onReveal((r) => adaSaw.push(r));
      grace.onReveal((r) => graceSaw.push(r));
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await grace.submit(FIRST.id, CONFORMANCE_WRONG);
      await room.settle();

      // Nothing has been revealed yet, so nobody has heard anything.
      expect(adaSaw).toHaveLength(0);
      await host.reveal();
      await room.settle();

      expect(adaSaw).toHaveLength(1);
      expect(adaSaw[0]).toMatchObject({
        itemId: FIRST.id,
        position: 1,
        reveal: { answerKey: { correctOptionId: "opt_a" } },
      });
      expect(adaSaw[0]?.score?.points).toBe(1);
      expect(graceSaw[0]?.score?.points).toBe(0);
    });

    it("gives someone who did not answer the key but no marks", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const quiet = await joined(room, "Quiet");
      const seen: ItemReveal[] = [];
      quiet.onReveal((r) => seen.push(r));
      await host.reveal();
      await room.settle();
      expect(seen[0]?.score).toBeNull();
      expect(seen[0]?.reveal.answerKey).toEqual({ correctOptionId: "opt_a" });
    });

    it("makes a ScoreReveal the item player can take straight as initialReveal (#56)", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const seen: ItemReveal[] = [];
      ada.onReveal((r) => seen.push(r));
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await host.reveal();
      await room.settle();

      const scoreReveal = toScoreReveal(seen[0] as ItemReveal);
      expect(scoreReveal).toMatchObject({
        score: { points: 1 },
        answerKey: { correctOptionId: "opt_a" },
      });
      expect(toScoreReveal({ ...(seen[0] as ItemReveal), score: null })).toBeNull();
    });

    it("says nothing to a room that is not on an item", async () => {
      const room = await makeRoom([]);
      const host = await openHost(room);
      const ada = await joined(room, "Ada");
      const seen: ItemReveal[] = [];
      ada.onReveal((r) => seen.push(r));
      expect(await refusalOf(host.start())).toBe("empty_set");
      await room.settle();
      expect(seen).toHaveLength(0);
    });
  });

  describe(`${adapter}: aggregates`, () => {
    const aggregatesOf = async (room: ConformanceRoom) => {
      const host = await openHost(room);
      const seen: ItemAggregate[] = [];
      host.onAggregate((aggregate) => seen.push(aggregate));
      return { host, seen };
    };

    it("are pushed once per item change, never once per submission (ADR 0002)", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      const people: LiveSessionTransport[] = [];
      for (const name of ["A", "B", "C", "D", "E"]) people.push(await joined(room, name));
      for (const person of people) await person.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();

      // Five answers, and the dashboard has heard nothing at all.
      expect(seen).toHaveLength(0);
      await host.reveal();
      await room.settle();
      expect(seen).toHaveLength(1);
      await host.advance();
      await room.settle();
      expect(seen).toHaveLength(2);
    });

    it("count how the marks fell for the item, not which option anyone chose", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      await joined(room, "Quiet");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await grace.submit(FIRST.id, CONFORMANCE_WRONG);
      await host.reveal();
      await room.settle();

      expect(seen[0]).toEqual({
        itemId: FIRST.id,
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
      const room = await makeRoom([THIRD]);
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      const partial = await joined(room, "Partial");
      const key = THIRD.answerKey as { correctOptionIds: string[] };
      await partial.submit(THIRD.id, {
        type: "multiple_response",
        optionIds: [key.correctOptionIds[0] as string],
      });
      await host.reveal();
      await room.settle();
      expect(seen[0]).toMatchObject({ fullMarks: 0, partialMarks: 1, noMarks: 0 });
    });

    it("carries the tally of the item the room has just left, and one more when it ends", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      const ada = await joined(room, "Ada");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await host.advance();
      await room.settle();
      expect(seen).toEqual([expect.objectContaining({ position: 1, responded: 1 })]);
      await host.end();
      await room.settle();
      expect(seen.at(-1)).toMatchObject({ position: 2, responded: 0, meanPoints: 0 });
    });

    it("never report more answers than people, when someone answers and then drops out", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      const ada = await joined(room, "Ada");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      // A phone locks, a tab reloads: the answer stays, the person goes.
      await ada.leave();
      await room.settle();
      await host.reveal();
      await room.settle();
      expect(seen[0]).toMatchObject({ present: 1, responded: 1 });
    });

    it("count the room, or the answers, whichever is larger — and never a union of the two", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      const ada = await joined(room, "Ada");
      await joined(room, "Grace");
      await joined(room, "Quiet");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      // Ada answered and left; Grace and Quiet are still here and have not answered. A tally
      // carries no participant ids, so no adapter can know that Ada is not one of the two still
      // in the room — `present` is the larger of the two counts, and both adapters say so.
      await ada.leave();
      await room.settle();
      await host.reveal();
      await room.settle();
      expect(seen[0]).toMatchObject({ present: 2, responded: 1 });
    });

    it("are counted from the answers on record, not from the last time an item changed", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      await joined(room, "Quiet");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await grace.submit(FIRST.id, CONFORMANCE_WRONG);
      await room.settle();

      // Nothing has been revealed and the room has not moved, so nothing has been pushed. A
      // console opening now — an instructor's tab reloading mid-item — must still see the answers
      // that are already in.
      expect((await host.open()).aggregate).toMatchObject({
        position: 1,
        present: 3,
        responded: 2,
        fullMarks: 1,
        noMarks: 1,
        meanPoints: 0.5,
        maxPoints: 1,
      });
    });

    it("can be asked for while an item is open, without anything being pushed", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.start();
      await room.settle();
      expect(await host.aggregate()).toMatchObject({ position: 1, responded: 0 });

      const ada = await joined(room, "Ada");
      const grace = await joined(room, "Grace");
      await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
      await room.settle();
      // The count a host watches while the class answers. Asking is a read, not a message.
      expect(await host.aggregate()).toMatchObject({ position: 1, present: 2, responded: 1 });
      await grace.submit(FIRST.id, CONFORMANCE_WRONG);
      await room.settle();
      expect(await host.aggregate()).toMatchObject({ present: 2, responded: 2 });
      // Two answers and three asks, and the dashboard has still been pushed nothing (ADR 0002).
      expect(seen).toHaveLength(0);
    });

    it("are null when the room is on no item, however it got there", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      expect(await host.aggregate()).toBeNull();
      await host.start();
      await room.settle();
      expect(await host.aggregate()).not.toBeNull();
      await host.end();
      await room.settle();
      expect(await host.aggregate()).toBeNull();
    });

    it("say nothing when the room never reached an item", async () => {
      const room = await makeRoom();
      const { host, seen } = await aggregatesOf(room);
      await host.end();
      await room.settle();
      expect(seen).toHaveLength(0);
    });

    it("are on the host's opening snapshot, and nowhere on a participant's", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      await host.start();
      await room.settle();
      expect((await host.open()).aggregate).toMatchObject({ position: 1, responded: 0 });
      const snapshot = await room.participant().join("LEARN7", { displayName: "Ada" });
      expect(snapshot).not.toHaveProperty("aggregate");
    });
  });

  describe(`${adapter}: the host console`, () => {
    it("rejects a refused command with the code to branch on", async () => {
      const room = await makeRoom(CONFORMANCE_ITEMS.slice(0, 1));
      const host = await openHost(room);
      await host.start();
      await room.settle();
      expect(await refusalOf(host.advance())).toBe("past_end");
      expect(await refusalOf(host.resume())).toBe("not_paused");
      await host.end();
      await room.settle();
      expect(await refusalOf(host.reveal())).toBe("not_open");
    });

    it("moves the room, and both sides hear about it", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const hostViews: SessionView<Item>[] = [];
      host.onSessionState((view) => hostViews.push(view));
      const ada = await joined(room, "Ada");
      const adaViews: SessionView<ParticipantItem>[] = [];
      ada.onSessionState((view) => adaViews.push(view));

      await host.start();
      await host.pause();
      await host.resume();
      await host.advance();
      await room.settle();

      await expect(room.currentState()).resolves.toMatchObject({
        status: "running",
        position: 2,
        reveal: false,
      });
      expect(hostViews.map((v) => v.state.status)).toEqual([
        "running",
        "paused",
        "running",
        "running",
      ]);
      expect(adaViews).toHaveLength(4);
      expect(adaViews.at(-1)?.item?.id).toBe(SECOND.id);
    });

    it("stops hearing anything once it closes, and closing twice is harmless", async () => {
      const room = await makeRoom();
      const host = await openHost(room);
      const views: SessionView<Item>[] = [];
      host.onSessionState((view) => views.push(view));
      await host.close();
      await host.close();
      await (await openHost(room)).start();
      await room.settle();
      expect(views).toHaveLength(0);
    });

    it("lets a co-instructor open a second console on the same room", async () => {
      const room = await makeRoom();
      const one = await openHost(room);
      const two = await openHost(room);
      const seen: SessionView<Item>[] = [];
      two.onSessionState((view) => seen.push(view));
      await one.start();
      await room.settle();
      expect(seen.at(-1)?.state.position).toBe(1);
    });
  });
}
