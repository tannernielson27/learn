import { FIXTURES } from "@/lib/ngn/fixtures";
import type { ItemFixture } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type ItemType } from "@/lib/ngn/schemas";
import { FakeRoom } from "./fake-room";

/**
 * A three-item set from the canonical fixtures, with the responses each fixture already documents
 * so the simulated class answers with real answers rather than invented ones.
 *
 * Parsed on the server, as every other gallery route does, and handed to the room **with** its
 * answer keys: the room is the server here. ADR 0003 allows scoring in this browser in the gallery
 * and nowhere a student can reach; what the room passes its participant connections is keyless, and
 * the page shows that it is.
 */
function entry<T extends ItemType>(fixture: ItemFixture<T>) {
  return {
    item: itemSchema.parse(fixture.canonical),
    responses: fixture.cases.map((sample) => sample.response as AnyResponse),
  };
}

const SET = [
  entry(FIXTURES.multiple_choice),
  entry(FIXTURES.multiple_response),
  entry(FIXTURES.matrix_multiple_choice),
];

export default function FakeRoomPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Fake room</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        A live session with no database behind it. The in-memory transport plays the server: it
        holds the items and their keys, enforces the state machine, and hands each participant a
        connection that cannot see a key until the host reveals it. Start the session, send the
        class&rsquo;s answers, reveal, advance. Nothing here talks to Supabase.
      </p>
      <FakeRoom set={SET} />
    </article>
  );
}
