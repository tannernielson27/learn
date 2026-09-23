import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  CONFORMANCE_WRONG,
} from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseHost } from "./hostTransport";
import { createFakeClient } from "./testing/fakeSupabase";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * #197: the console asks for the tally and for the results panel on the same three-second tick,
 * and both are counted from the same rows. One read of `session_responses` has to serve both.
 */
const [FIRST, SECOND] = CONFORMANCE_ITEMS as [Item, Item];

function room(): FakeRoom {
  return createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-0000000000b7",
  });
}

/** The host's own client, with every `select` on `session_responses` written down. */
function countingHost(live: FakeRoom) {
  const reads: string[] = [];
  const client = createFakeClient(live.stack, { role: "authenticated", orgId: live.orgId });
  const counted = {
    ...client,
    from(table: string) {
      const query = client.from(table as "session_responses");
      if (table !== "session_responses") return query;
      return {
        ...query,
        select: (columns: string) => {
          reads.push(columns);
          return query.select(columns);
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  const host = createSupabaseHost({ client: counted, sessionId: live.sessionId });
  return { host, reads };
}

/** A started room on item 1, the host console open, and two answers in. */
async function answeredRoom() {
  const live = room();
  const { host, reads } = countingHost(live);
  await host.open();
  await host.start();
  await live.settle();
  const ada = live.participant();
  await ada.join(live.code, { displayName: "Ada" });
  const bo = live.participant();
  await bo.join(live.code, { displayName: "Bo" });
  await live.settle();
  await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
  await bo.submit(FIRST.id, CONFORMANCE_WRONG);
  await live.settle();
  reads.length = 0;
  return { live, host, reads };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("one read of session_responses per host tick (#197)", () => {
  it("serves the tally and the results panel from one read when both ask at once", async () => {
    const { host, reads } = await answeredRoom();

    const [aggregate, results] = await Promise.all([host.aggregate(), host.results()]);

    expect(reads).toHaveLength(1);
    expect(reads[0]).toBe("response, points, max_points");
    expect(aggregate).toMatchObject({ itemId: FIRST.id, responded: 2, fullMarks: 1, noMarks: 1 });
    expect(results).toMatchObject({ itemId: FIRST.id, kind: "options", responded: 2 });
  });

  it("shares the read when the two asks land one after the other on the same tick", async () => {
    const { host, reads } = await answeredRoom();

    const aggregate = await host.aggregate();
    const results = await host.results();

    expect(reads).toHaveLength(1);
    expect(aggregate).toMatchObject({ responded: 2 });
    expect(results).toMatchObject({ responded: 2 });
  });

  it("reads again on the next tick, so answers that arrived in between are counted", async () => {
    const { live, host, reads } = await answeredRoom();
    await Promise.all([host.aggregate(), host.results()]);

    const grace = live.participant();
    await grace.join(live.code, { displayName: "Grace" });
    await grace.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();

    const [aggregate, results] = await Promise.all([host.aggregate(), host.results()]);
    expect(reads).toHaveLength(2);
    expect(aggregate).toMatchObject({ responded: 3, fullMarks: 2 });
    expect(results).toMatchObject({ responded: 3 });
  });

  it("never hands one caller the same read twice", async () => {
    const { live, host, reads } = await answeredRoom();
    expect(await host.aggregate()).toMatchObject({ responded: 2 });

    const grace = live.participant();
    await grace.join(live.code, { displayName: "Grace" });
    await grace.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();

    expect(await host.aggregate()).toMatchObject({ responded: 3 });
    expect(reads).toHaveLength(2);
  });

  it("does not share a read once it is older than a tick's worth of slack", async () => {
    const { host, reads } = await answeredRoom();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await host.aggregate();
    clock.mockReturnValue(now + 2_000);
    await host.results();
    expect(reads).toHaveLength(2);
  });

  it("does not share a read across items", async () => {
    const { live, host, reads } = await answeredRoom();
    expect(await host.aggregate()).toMatchObject({ itemId: FIRST.id, responded: 2 });

    await host.advance();
    await live.settle();

    expect(await host.results()).toMatchObject({ itemId: SECOND.id, responded: 0 });
    expect(reads).toHaveLength(2);
  });
});
