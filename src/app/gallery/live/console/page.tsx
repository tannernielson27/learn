import type { Metadata } from "next";
import { SessionQrCode } from "@/components/live/SessionQrCode";
import { FIXTURES } from "@/lib/ngn/fixtures";
import type { ItemFixture } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type ItemType } from "@/lib/ngn/schemas";
import { ConsoleDemo } from "./demo";
import { CONSOLE_STATES, type ConsoleState } from "./states";

export const metadata: Metadata = { title: "Live console" };

function entry<T extends ItemType>(fixture: ItemFixture<T>) {
  return {
    item: itemSchema.parse(fixture.canonical),
    responses: fixture.cases.map((sample) => sample.response as AnyResponse),
  };
}

const SET = [entry(FIXTURES.multiple_choice), entry(FIXTURES.multiple_response)];

const JOIN_URL = "https://learnursing.app/join/LEARN7";

function parseState(value: string | string[] | undefined): ConsoleState {
  return (CONSOLE_STATES as readonly string[]).includes(String(value))
    ? (value as ConsoleState)
    : "question";
}

/**
 * The teacher's control view of a live session (`HostLobby`, `ControlView`) in each state, driven
 * by the in-memory room as `/gallery/live` is: no database, no Realtime. `?state=` picks one. The
 * room is the server here and holds the fixtures' keys (ADR 0003 allows that in the gallery,
 * which production answers 404 for); the console shows what it shows a teacher.
 *
 * Under `/gallery/live` rather than in the nav, as the podium is: a nav entry restales every
 * visual baseline.
 */
export default async function LiveConsoleGallery({
  searchParams,
}: PageProps<"/gallery/live/console">) {
  const state = parseState((await searchParams).state);
  return (
    <ConsoleDemo
      state={state}
      set={SET}
      studentUrl={JOIN_URL}
      qrCode={<SessionQrCode url={JOIN_URL} label="QR code for joining this live session" />}
    />
  );
}
