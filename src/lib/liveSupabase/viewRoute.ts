/**
 * `POST /api/live/view` — everything a participant's page is allowed to know right now.
 *
 * This is the one place a key can reach a student, and it is why the route exists at all instead
 * of letting a browser read the tables. A participant has no Postgres identity: `anon` has no
 * privilege on `public.sessions` and none on `public.items`, so the item is read here, under the
 * service role, and `toKeylessItem` strips the key, the rationale and the scoring before anything
 * is serialized (ADR 0003, #56; `viewEntries.ts` is where). The key travels exactly once — in
 * `revealed` — and only when `sessions.reveal` is true for the item the room is on, which the host
 * sets and the browser cannot.
 *
 * It also answers the one question a phone cannot answer for itself after a reload: **have I
 * already answered this?** `answered` is that, and it is this participant's own response read
 * back to them — not a mark. The distinction is the whole of ADR 0003 here: what they sent is
 * theirs, what it earned is the host's until the reveal.
 *
 * POST, not GET, for one reason: a GET route handler can be prerendered or cached, and nothing
 * that may carry an answer key is allowed anywhere near a cache. Every answer also carries
 * `Cache-Control: no-store`.
 *
 * ## One round trip (#407)
 *
 * Every move the host makes sends every phone here at once, so what one call costs is multiplied
 * by the class. It used to be four database calls in a row, five after a reveal, two of them
 * writes. It is now one: `public.open_session_view` checks the participant's token, charges
 * their rate limit, and answers with the room, the item (or the whole student-paced set) and
 * their own answers. See the migration for what it reads and why the keys in what it returns are
 * no new exposure.
 *
 * **The app deploys before the migration is pushed**, so a database that has never heard of the
 * function is an ordinary state, not a fault. PostgREST says so with `PGRST202`, having run
 * nothing, and the route then does what it did before: `resume_participant`,
 * `begin_session_view`, and the two selects in `viewReads.ts`. It remembers for a minute that the
 * function is missing, so that fallback costs the four calls it always cost and not five.
 *
 * ## How often one person may ask (#152)
 *
 * A participant token is required, so this route is not anonymous — but a participant of a room
 * could spin it as fast as it liked. `private.take_session_view` is the cap, charged by
 * `open_session_view` and by `begin_session_view` alike: one counter, 600 calls in five minutes,
 * and a `rate_limited` refusal that answers before anything else is read.
 *
 * ## When the database does not answer (#407)
 *
 * A call that fails is a 503 the phone retries, and a line in the log saying which call it was.
 * It is never a 401: that is only for a token the database has looked at and does not know.
 */
import {
  itemAt,
  pacedSet,
  pacedState,
  type LiveSessionState,
  type ParticipantItem,
} from "@/lib/live";
import type { ParticipantToken } from "@/lib/live/participantToken";
import { readTimer } from "@/lib/live/timer";
import type { StartingOrderSeedFor } from "@/lib/ngn/startingOrder";
import type { Database } from "@/lib/supabase/database.types";
import {
  LIVE_ROUTE_ERRORS,
  asRefusal,
  fail,
  faultResponse,
  readParticipantToken,
  refuse,
  reportLiveFault,
  routeOf,
  unavailable,
  type LiveRouteDeps,
  type VerifiedParticipant,
} from "./routeDeps";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import { readCachedSessionRecord } from "@/lib/supabase/sessionRecord";
import { roomRecord, viewEntries, type WantedItem } from "./viewEntries";
import { selectViewRows, type ViewRows } from "./viewReads";
import { NO_STORE_HEADERS, type ParticipantViewPayload } from "./wire";

/**
 * What the view route needs beyond the other live routes: the seed for an ordered-response item's
 * starting order (#219). Required, so no caller can forget it; the route handler passes
 * `secretStartingOrderSeed`, which is keyed with a server secret and so is never imported here,
 * where the barrel would carry `node:crypto` into a browser bundle.
 */
export interface ViewRouteDeps extends LiveRouteDeps {
  /**
   * Only the fallback asks this (#407). On `open_session_view` the token in the cookie is checked
   * by the function itself, in SQL, and `verify` is not called: a different verifier passed here
   * changes who the route lets in only against a database without the function.
   */
  verify: LiveRouteDeps["verify"];
  startingOrderSeed: StartingOrderSeedFor;
  /** The server's clock, for remembering a missing function. Injectable for the tests. */
  now?: () => number;
}

/** The room, as both `begin_session_view` and `open_session_view` answer with it. */
type RoomRow = Database["public"]["Functions"]["begin_session_view"]["Returns"][number];

/** A request the route may answer: who is asking, their room, and the rows if already read. */
type Opened =
  | { ok: true; participant: VerifiedParticipant; room: RoomRow; rows: ViewRows | null }
  | { ok: false; response: Response };

/** PostgREST found no function by that name and those arguments, and ran nothing. */
const FUNCTION_NOT_FOUND = "PGRST202";
/** How long a missing `open_session_view` is taken as still missing before it is asked again. */
const REPROBE_MS = 60_000;
/**
 * When `open_session_view` may next be tried, in epoch ms. Per server process, and only an
 * optimisation: every process that guesses wrong finds out with one call and corrects itself.
 */
let functionMissingUntil = 0;

/** Forgets that the function was missing. For the tests, which share this module. */
export function forgetMissingViewFunction(): void {
  functionMissingUntil = 0;
}

export async function readParticipantView(
  request: Request,
  deps: ViewRouteDeps,
): Promise<Response> {
  // JSON only, the same rule the submission route holds a request to. Nothing here parses the
  // body and the participant cookie is SameSite=Lax, so this closes no hole on its own; it stops
  // the two routes having two different ideas of what a request to this app looks like.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return refuse("malformed");
  }

  const opened = await openView(request, deps);
  if (!opened.ok) return opened.response;
  const { participant, room } = opened;

  const read = roomFrom(room);
  if (read === null) return fail(500, LIVE_ROUTE_ERRORS.failed);
  const { state, itemSet, serverNow } = read;
  const { wanted, wholeSet } = wantedItems(itemSet, state);

  // #335: a case-study room's chart, cut to the room's step. A student-paced room is always run
  // from a bank (`sessions_student_paced_bank_only`), so it has no record to read.
  const chart = wholeSet
    ? ({ ok: true, record: undefined } as const)
    : await chartOf(deps.service, participant.sessionId, state.position);
  if (!chart.ok) {
    reportLiveFault({ route: routeOf(request), sessionId: participant.sessionId, ...chart.fault });
    return faultResponse(chart.fault.status);
  }
  const record = chart.record === undefined ? {} : { record: chart.record };

  if (!wholeSet && wanted.length === 0) {
    return answer({ state, item: null, answered: null, revealed: null, ...record, serverNow });
  }

  let rows = opened.rows;
  if (rows === null) {
    const selected = await selectViewRows(deps.service, {
      ...participant,
      wanted,
      wholeSet,
      reveal: state.reveal,
    });
    if (!selected.ok) {
      const { call, error, status } = selected;
      reportLiveFault({
        route: routeOf(request),
        call,
        sessionId: participant.sessionId,
        error,
        status,
      });
      return faultResponse(status);
    }
    rows = selected.rows;
  }

  const built = viewEntries({
    sessionId: participant.sessionId,
    wanted,
    items: rows.items,
    answers: rows.answers,
    reveal: state.reveal,
    startingOrderSeed: deps.startingOrderSeed,
  });
  if (!built.ok) return fail(409, LIVE_ROUTE_ERRORS.unplayable);

  // #185: a student-paced room is on its whole set, and the phone is handed all of it.
  if (wholeSet) {
    return answer({
      state,
      item: null,
      answered: null,
      revealed: null,
      set: built.entries,
      serverNow,
    });
  }
  const [only] = built.entries;
  const item: ParticipantItem | null = only?.item ?? null;
  return answer({
    state,
    item,
    answered: only?.answered ?? null,
    revealed: only?.revealed ?? null,
    ...record,
    serverNow,
  });
}

function answer(payload: ParticipantViewPayload): Response {
  return Response.json(payload, { headers: NO_STORE_HEADERS });
}

type Chart =
  | { ok: true; record: EhrRecordView | undefined }
  | { ok: false; fault: { call: string; error: unknown; status: number } };

/**
 * The room's chart at its step (#335), the same on `open_session_view` and on the calls it
 * replaced: neither reads the record, so both ask `readCachedSessionRecord`, which each server
 * process answers from the database once per room, and both cut it with `roomRecord`.
 */
async function chartOf(
  service: ViewRouteDeps["service"],
  sessionId: string,
  position: number | null,
): Promise<Chart> {
  const read = await readCachedSessionRecord(service, sessionId);
  if (!read.ok) {
    return {
      ok: false,
      fault: { call: "select:sessions.patient_record", error: read.error, status: read.status },
    };
  }
  return { ok: true, record: roomRecord(read.record, position) };
}

/**
 * Who is asking and what room they are in: by `open_session_view` in one call, or, against a
 * database that does not have it yet, by the two calls it replaced.
 */
async function openView(request: Request, deps: ViewRouteDeps): Promise<Opened> {
  // Shape only, and it decides one thing: a request with no token is not worth a round trip.
  const token = readParticipantToken(request);
  if (token === null) return { ok: false, response: signedOut() };

  const now = deps.now?.() ?? Date.now();
  if (now < functionMissingUntil) return openViewInTwoCalls(request, deps);

  const { data, error, status } = await deps.service.rpc("open_session_view", {
    target_participant: token.participantId,
    target_session: token.sessionId,
    presented_secret: token.secret,
  });
  if (error?.code === FUNCTION_NOT_FOUND) {
    functionMissingUntil = now + REPROBE_MS;
    return openViewInTwoCalls(request, deps);
  }
  if (error) return faulted(request, "open_session_view", token, { error, status });

  const row = data?.[0];
  // The database looked, and this token is nobody's: unknown, tampered, for another session, or
  // for a participant or a session that is gone. The only 401 there is.
  if (!row) return { ok: false, response: signedOut() };
  const refused = refusalOf(row);
  if (refused !== null) return { ok: false, response: refused };
  return {
    ok: true,
    participant: { sessionId: token.sessionId, participantId: token.participantId },
    room: row,
    rows: { items: listOf(row.view_items), answers: listOf(row.view_answers) },
  };
}

/** The route as it was before #407, for a database the migration has not reached. */
async function openViewInTwoCalls(request: Request, deps: ViewRouteDeps): Promise<Opened> {
  const verified = await deps.verify(request);
  if (!verified.ok) {
    return {
      ok: false,
      response: verified.reason === "unavailable" ? unavailable() : signedOut(),
    };
  }
  const { participant } = verified;

  // Charges this participant's rate limit and reads the room in one round trip (#152). Who is
  // speaking is settled first and the limit charged second, so nobody can spend a budget that is
  // not theirs.
  const { data, error, status } = await deps.service.rpc("begin_session_view", {
    target_session: participant.sessionId,
    participant: participant.participantId,
  });
  if (error) return faulted(request, "begin_session_view", participant, { error, status });
  const row = data?.[0];
  // A participant whose session has been deleted is not in a room any more. The token is the only
  // thing that said otherwise, and it says nothing about whether the row still exists.
  if (!row) return { ok: false, response: signedOut() };
  const refused = refusalOf(row);
  if (refused !== null) return { ok: false, response: refused };
  return { ok: true, participant, room: row, rows: null };
}

function signedOut(): Response {
  return fail(401, LIVE_ROUTE_ERRORS.signedOut);
}

/** A call that did not come back: written down, and answered as something to try again. */
function faulted(
  request: Request,
  call: string,
  who: Pick<ParticipantToken, "sessionId">,
  failure: { error: unknown; status: number },
): Opened {
  reportLiveFault({ route: routeOf(request), call, sessionId: who.sessionId, ...failure });
  return { ok: false, response: faultResponse(failure.status) };
}

/**
 * The refusal a room row carries, as a response, or null when it carries none.
 *
 * A refused call answers with nulls in every other column, so a code this app does not know is
 * not something to carry on past: it would put a null status on a student's page. Never passed
 * through as itself either — an unknown code reaches a person as an empty sentence.
 */
function refusalOf(row: Pick<RoomRow, "refusal">): Response | null {
  const refusal = asRefusal(row.refusal);
  if (refusal !== null) return refuse(refusal);
  return row.refusal ? fail(500, LIVE_ROUTE_ERRORS.failed) : null;
}

/** A jsonb array from the database, as a list. Anything else is an empty one. */
function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The room a row describes, or null when the row cannot be read: a fault, not a room. */
function roomFrom(
  row: RoomRow,
): { state: LiveSessionState; itemSet: readonly unknown[]; serverNow: number } | null {
  const itemSet = listOf(row.session_items);
  // A `returns table` function carries no nullability into the generated types, so every column
  // is coerced before it is read: a timer column is null whenever the timer is off or not
  // running, and the position really is null before the room starts.
  const timer = readTimer(
    row.session_timer_seconds ?? null,
    row.session_ends_at ?? null,
    row.session_remaining_ms ?? null,
  );
  if (timer === null) return null;
  // The database's clock as it read the room (#182), for the phone to measure its own against.
  const serverNow = Date.parse(row.server_now);
  if (Number.isNaN(serverNow)) return null;
  const state: LiveSessionState = pacedState(
    {
      status: row.session_status,
      position: row.session_position ?? null,
      itemCount: itemSet.length,
      reveal: row.session_reveal,
      timer,
    },
    row.session_mode,
  );
  return { state, itemSet, serverNow };
}

/**
 * Which items the room is showing, by `pacedSet` and `itemAt`: the one rule for it, here as in
 * the in-memory adapter. `open_session_view` reads by the same rule in SQL; if the two ever
 * disagreed, an item this asked for would be missing from the rows and the view would be refused
 * as unplayable rather than shown wrong.
 */
function wantedItems(
  itemSet: readonly unknown[],
  state: LiveSessionState,
): { wanted: WantedItem[]; wholeSet: boolean } {
  const set = pacedSet(itemSet, state);
  if (set !== null) {
    const wanted = set.map((id, index) => ({ id: String(id), position: index + 1 }));
    return { wanted, wholeSet: true };
  }
  const current = itemAt(itemSet, state);
  // `itemAt` only answers with an id while the room is on an item, which is exactly when
  // `position` is not null.
  if (typeof current !== "string" || state.position === null)
    return { wanted: [], wholeSet: false };
  return { wanted: [{ id: current, position: state.position }], wholeSet: false };
}
