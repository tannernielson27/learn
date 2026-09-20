import { describe, expect, it } from "vitest";
import { answerAll, createInMemoryRoom, joinSimulated } from "@/lib/live";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";

const item: Item = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const CORRECT: AnyResponse = { type: "multiple_choice", optionId: "opt_a" };
const WRONG: AnyResponse = { type: "multiple_choice", optionId: "opt_c" };

const room = () => createInMemoryRoom({ items: [item], code: "LEARN7" });

describe("joinSimulated", () => {
  it("puts one participant in the room per name, in order", async () => {
    const live = room();
    const people = await joinSimulated(live, ["Ada", "Grace", "Alan"]);
    expect(people.map((p) => p.displayName)).toEqual(["Ada", "Grace", "Alan"]);
    expect(people.map((p) => p.participantId)).toEqual(["p1", "p2", "p3"]);
  });

  it("scales to the class docs/03 §4 asks for without a database", async () => {
    const live = room();
    const names = Array.from({ length: 60 }, (_, index) => `Student ${index + 1}`);
    const people = await joinSimulated(live, names);
    const host = live.host();
    const snapshot = await host.open();
    expect(people).toHaveLength(60);
    expect(snapshot.roster).toHaveLength(60);
  });
});

describe("answerAll", () => {
  it("has everyone answer, and leaves out whoever the caller returns null for", async () => {
    const live = room();
    const host = live.host();
    await host.start();
    const people = await joinSimulated(live, ["Ada", "Grace", "Alan", "Quiet"]);

    const round = await answerAll(people, item.id, ({ index }) =>
      index === 3 ? null : index === 0 ? CORRECT : WRONG,
    );

    expect(round).toEqual({ submitted: 3, refused: {} });
    const seen: { responded: number; fullMarks: number }[] = [];
    host.onAggregate((aggregate) => seen.push(aggregate));
    await host.reveal();
    expect(seen[0]).toMatchObject({ responded: 3, fullMarks: 1, present: 4 });
  });

  it("counts refusals by code rather than throwing the page away", async () => {
    const live = room();
    const host = live.host();
    await host.start();
    const people = await joinSimulated(live, ["Ada", "Grace"]);
    await answerAll(people, item.id, () => CORRECT);

    const again = await answerAll(people, item.id, () => CORRECT);
    expect(again).toEqual({ submitted: 0, refused: { already_answered: 2 } });
  });

  it("reports a room that is not taking answers", async () => {
    const live = room();
    const people = await joinSimulated(live, ["Ada"]);
    expect(await answerAll(people, item.id, () => CORRECT)).toEqual({
      submitted: 0,
      refused: { not_started: 1 },
    });
  });

  it("lets an error that is not a refusal through", async () => {
    const live = room();
    await live.host().start();
    const people = await joinSimulated(live, ["Ada"]);
    const boom = new Error("network");
    const broken = [
      {
        ...people[0]!,
        transport: {
          ...people[0]!.transport,
          submit: async () => {
            throw boom;
          },
        },
      },
    ];
    await expect(answerAll(broken, item.id, () => CORRECT)).rejects.toBe(boom);
  });
});
