// #187: one simulated student, doing exactly what a phone does and nothing a phone cannot.
//
//   1. Joins through the join form (see join.mjs), which leaves it holding the httpOnly
//      participant cookie and nothing else.
//   2. Asks `POST /api/live/channel` for a Realtime channel token with that cookie. The phone's
//      first token comes from the play page's server render; the same route mints its later ones,
//      and asking it up front saves parsing a React payload for a token.
//   3. Opens its own socket to its session's private channel (`src/lib/liveSupabase/
//      participantTransport.ts`): `postgres_changes` on `live.session_public_state` for the room's
//      moves, tracking itself in Presence, with the publishable key and that token. Since #426 a
//      phone binds no presence listener; `--student-presence on` binds one, as phones did before.
//   4. On every move that changes the item or the reveal, reads `POST /api/live/view`; on an item
//      it has not answered, thinks for a while and posts `POST /api/live/submit`.
//
// It never holds a key: the item it answers is the keyless one the view route sends, and the
// cookie is the whole of its authority, as on a phone.

import { createClient } from "@supabase/supabase-js";
import { randomResponse } from "./answers.mjs";
import { actionFields, readJoin } from "./join.mjs";

const ROUTES = { view: "/api/live/view", submit: "/api/live/submit", channel: "/api/live/channel" };

/** Replace the channel token this long before it expires, as `channelTokenSource.ts` does. */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

const SUBSCRIBE_TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The refusal code in a refused route response, or `http_<status>`. */
async function refusalOf(response) {
  try {
    const body = await response.json();
    if (typeof body?.refusal === "string") return body.refusal;
  } catch {
    // Not JSON: the status is all there is.
  }
  return `http_${response.status}`;
}

/**
 * @param {object} deps
 * @param {string} deps.displayName
 * @param {object} deps.options   what `readOptions` returned
 * @param {() => number} deps.rng
 * @param {object} deps.events    `{ measure(kind, ms), refused(kind, code), answered(position, how) }`
 */
/**
 * Counts every frame this socket is sent on its own channel, by event (#426): `postgres_changes`,
 * `presence_state`, `presence_diff`, `system`, `phx_reply`. A presence listener's callbacks are
 * not the measure: the server can send presence to a socket that has no listener for it, and the
 * question is whether it does. `socketAdapter` is realtime-js's own (2.116.0), so a version
 * without it stops the run: zero frames counted would read as a saving.
 */
function countFrames(client, topic, frames) {
  const adapter = client.realtime?.socketAdapter;
  if (typeof adapter?.onMessage !== "function") {
    throw new Error("frames_uncountable: this realtime-js has no socketAdapter.onMessage");
  }
  adapter.onMessage((message) => {
    if (message?.topic !== topic || typeof message.event !== "string") return;
    frames[message.event] = (frames[message.event] ?? 0) + 1;
  });
}

export function createParticipant({ displayName, options, rng, events }) {
  const { base } = options;
  let cookie = null;
  let sessionId = null;
  let participantId = null;
  let token = null;
  let client = null;
  let channel = null;
  let gone = false;
  let ended = false;
  /** Last state seen, so a pause or a presence tick costs no request. */
  let seen = { position: null, reveal: null };
  /** Item ids already answered or passed, so a second move on the same item is not a second answer. */
  const handled = new Set();
  /** Listener callbacks, and (#426) every frame the socket was sent on its channel, by event. */
  const counts = { state: 0, presence: 0, frames: {} };
  /** Student-paced: whether this phone is already working through the set. */
  let working = false;

  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  async function timed(kind, work) {
    const started = performance.now();
    const result = await work();
    events.measure(kind, performance.now() - started);
    return result;
  }

  async function join(code) {
    const page = await fetch(`${base}/join`);
    if (!page.ok) return { ok: false, refusal: `join_page_${page.status}` };
    const form = new FormData();
    for (const [name, value] of actionFields(await page.text())) form.append(name, value);
    form.append("code", code);
    form.append("displayName", displayName);

    const response = await timed("join", () =>
      fetch(`${base}/join`, { method: "POST", body: form, redirect: "manual" }),
    );
    const joined = readJoin({
      status: response.status,
      location: response.headers.get("location"),
      setCookies: response.headers.getSetCookie(),
      body: response.status === 200 ? await response.text() : "",
    });
    if (joined.ok) ({ cookie, sessionId, participantId } = joined);
    return joined;
  }

  /** Fetches a channel token; answers with the refusal code, or null when it got one. */
  async function fetchToken() {
    const response = await post(ROUTES.channel, {});
    if (!response.ok) return `channel_${await refusalOf(response)}`;
    token = await response.json();
    return null;
  }

  /** The client's `accessToken` callback: the token held, renewed near expiry. */
  async function accessToken() {
    if (token.expiresAt - Date.now() < REFRESH_AHEAD_MS && !ended) {
      const refusal = await fetchToken();
      if (refusal !== null) events.refused("channel", refusal);
    }
    return token.token;
  }

  async function close() {
    if (client === null) return;
    if (channel !== null) {
      try {
        await channel.untrack();
      } catch {
        // The entry goes with the socket.
      }
      await client.removeChannel(channel);
    }
    client.realtime.disconnect();
  }

  /**
   * `named` is true in a student-paced set, where the phone chooses the item and so names its
   * place, as `participantTransport.ts` does; an instructor-paced answer sends no position.
   */
  async function answer(item, position, named = false) {
    await sleep(options.thinkMs[0] + rng() * (options.thinkMs[1] - options.thinkMs[0]));
    if (gone) return;
    if (rng() < options.blank) {
      events.answered(position, "blank");
      return;
    }
    const response = randomResponse(item, rng);
    const body = named ? { itemId: item.id, response, position } : { itemId: item.id, response };
    const sent = await timed("submit", () => post(ROUTES.submit, body));
    if (sent.ok) {
      events.answered(position, "sent");
      return;
    }
    events.refused("submit", await refusalOf(sent));
    events.answered(position, "refused");
  }

  /**
   * A student-paced set (#404): one item after another, each after its own think time, as a
   * student works down the list. The phone does not read the view again between items.
   */
  async function answerSet(set) {
    if (working) return;
    working = true;
    try {
      for (const entry of set) {
        if (gone || ended) return;
        if (entry.answered !== null || handled.has(entry.item.id)) continue;
        handled.add(entry.item.id);
        await answer(entry.item, entry.position, true);
      }
    } finally {
      working = false;
    }
  }

  async function view() {
    const response = await timed("view", () => post(ROUTES.view, {}));
    if (!response.ok) {
      events.refused("view", await refusalOf(response));
      return;
    }
    const payload = await response.json();
    const { state, item, answered, revealed } = payload;
    if (state.status === "ended") ended = true;
    if (state.status === "running" && Array.isArray(payload.set)) {
      if (!state.reveal) void answerSet(payload.set).catch((error) => events.failed(error));
      return;
    }
    if (state.status !== "running" || item === null || revealed !== null) return;
    if (answered !== null || handled.has(item.id)) return;
    handled.add(item.id);
    void answer(item, state.position).catch((error) => events.failed(error));
  }

  function onState(row) {
    counts.state += 1;
    if (gone || row === null || typeof row !== "object") return;
    if (row.status === "ended") ended = true;
    if (row.item_position === seen.position && row.reveal === seen.reveal) return;
    seen = { position: row.item_position, reveal: row.reveal };
    void view().catch((error) => events.failed(error));
  }

  function subscribe() {
    const joinedAt = Date.now();
    channel = client.channel(`live:${sessionId}`, {
      config: { private: true, presence: { key: participantId } },
    });
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "live",
        table: "session_public_state",
        filter: `session_id=eq.${sessionId}`,
      },
      (message) => onState(message.new),
    );
    if (options.studentPresence) {
      channel.on("presence", { event: "sync" }, () => {
        counts.presence += 1;
      });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("channel_timeout")), SUBSCRIBE_TIMEOUT_MS);
      let settled = false;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ participantId, displayName, joinedAt }).then(() => {
            if (settled) return void view().catch((error) => events.failed(error));
            settled = true;
            clearTimeout(timer);
            resolve();
          }, reject);
        } else if (!settled && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`channel_${status.toLowerCase()}`));
        }
      });
    });
  }

  return {
    displayName,
    counts,
    get ended() {
      return ended;
    },

    /** Joins, opens the socket and reads the room once. Resolves to the join's outcome. */
    async enter(code) {
      const joined = await join(code);
      if (!joined.ok) return joined;
      const refused = await fetchToken();
      if (refused !== null) return { ok: false, refusal: refused };
      client = createClient(options.supabaseUrl, options.publishableKey, { accessToken });
      countFrames(client, `realtime:live:${sessionId}`, counts.frames);
      try {
        await client.realtime.setAuth();
        await subscribe();
        await view();
      } catch (error) {
        // A socket left open would keep the whole run from exiting.
        gone = true;
        await close().catch(() => {});
        throw error;
      }
      return { ok: true };
    },

    async leave() {
      gone = true;
      await close();
    },
  };
}
