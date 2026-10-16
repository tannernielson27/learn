// #187: `--host` — an instructor that starts a session and walks it through every item, so a load
// run can go end to end with nobody at the host console.
//
// It signs in as a real instructor and does what the host console does, under that instructor's
// own row level security: `start_session` to open the room, then writes `status`,
// `current_position` and `reveal` on the session row the way `hostTransport.ts` does (the
// `guard_session_change` trigger holds it to the same transitions), and `end_session` at the end.
// It never touches the service role.
//
// #426: with `--student-presence off` (the default) it also watches the roster the way the console
// does and asks `refresh_participant_count` when someone new joins, at most once every
// `COUNT_REFRESH_MS` with one more ask at the end of a burst (`src/lib/liveSupabase/
// countRefresh.ts`). That is what keeps the phones' count fresh, and its rows are part of what a
// phone is sent, so a run without it would undercount the after.

import { createClient } from "@supabase/supabase-js";

/** `supabase/seed-demo.sql`'s account. Public and local-only, so it is only ever used locally. */
const LOCAL_DEMO = { email: "demo@learn.test", password: "learn-demo-local" };

/** Who to sign in as: explicit variables first, then the app's own demo pair, then local demo. */
export function hostCredentials(env, project) {
  const email = env.LOAD_HOST_EMAIL ?? env.DEMO_ACCOUNT_EMAIL;
  const password = env.LOAD_HOST_PASSWORD ?? env.DEMO_ACCOUNT_PASSWORD;
  if (email && password) return { email, password };
  if (project === "local") return LOCAL_DEMO;
  throw new Error("--host on a hosted project needs LOAD_HOST_EMAIL and LOAD_HOST_PASSWORD.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `COUNT_REFRESH_MS` in `src/lib/liveSupabase/countRefresh.ts`. */
const COUNT_REFRESH_MS = 3000;

/**
 * The console's roster and count refresh (#426), said again for a script that cannot import the
 * app's TypeScript: a newcomer asks at once after a quiet spell, and newcomers inside the interval
 * are caught by one more ask at its end.
 */
async function watchRoster(client, sessionId) {
  const seen = new Set();
  let lastAsked = Number.NEGATIVE_INFINITY;
  let waiting = null;
  let stopped = false;
  const ask = () => {
    waiting = null;
    if (stopped) return;
    lastAsked = Date.now();
    void Promise.resolve(client.rpc("refresh_participant_count", { target: sessionId })).catch(
      () => {},
    );
  };
  await client.realtime.setAuth();
  const channel = client.channel(`live:${sessionId}`, { config: { private: true } });
  channel.on("presence", { event: "sync" }, () => {
    let someoneNew = false;
    for (const entries of Object.values(channel.presenceState())) {
      for (const entry of entries) {
        if (typeof entry?.participantId !== "string" || seen.has(entry.participantId)) continue;
        seen.add(entry.participantId);
        someoneNew = true;
      }
    }
    if (!someoneNew || waiting !== null) return;
    const wait = lastAsked + COUNT_REFRESH_MS - Date.now();
    if (wait <= 0) ask();
    else waiting = setTimeout(ask, wait);
  });
  channel.subscribe();
  return async () => {
    stopped = true;
    if (waiting !== null) clearTimeout(waiting);
    await client.removeChannel(channel);
  };
}

export async function openHostedSession({ options, credentials }) {
  const client = createClient(options.supabaseUrl, options.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword(credentials);
  if (signedIn.error)
    throw new Error(`The host could not sign in (${signedIn.error.status ?? "error"}).`);

  const source =
    options.source.kind === "bank"
      ? { source_bank: options.source.id }
      : { source_case_study: options.source.id };
  // #404: named only when it is not the default, as `startSession` in src/lib/supabase does.
  const args = options.paced ? { ...source, paced: "student_paced" } : source;
  const started = await client.rpc("start_session", args);
  if (started.error) throw new Error(`start_session refused: ${started.error.message}`);
  const sessionId = started.data;

  const read = await client.from("sessions").select("code, item_set").eq("id", sessionId).single();
  if (read.error) throw new Error("The new session could not be read back.");

  const stopWatching = options.studentPresence ? null : await watchRoster(client, sessionId);

  async function set(fields) {
    const { error } = await client.from("sessions").update(fields).eq("id", sessionId);
    if (error) throw new Error(`The host could not move the room: ${error.message}`);
  }

  return {
    sessionId,
    code: read.data.code,
    itemCount: read.data.item_set.length,

    /**
     * Opens each item, waits until `settled(position)` says every participant has answered or
     * passed (or the step times out), reveals, and moves on. Reports each step as it goes.
     */
    async run({ settled, expected, onStep, stopped = () => false }) {
      // A person at the console looks at the roster before pressing Start. Starting the instant
      // the last phone subscribes may race that phone's `postgres_changes` registration, which
      // Realtime completes a moment after SUBSCRIBED; #187's first run lost its first step that
      // way once, and it was not reproduced after. See docs/load-testing.md.
      await sleep(options.lobbyMs);
      if (options.paced) return this.runPaced({ settled, expected, onStep, stopped });
      for (let position = 1; position <= this.itemCount && !stopped(); position += 1) {
        const opened = Date.now();
        await set({ status: "running", current_position: position, reveal: false });
        while (
          settled(position) < expected &&
          Date.now() - opened < options.stepTimeoutMs &&
          !stopped()
        ) {
          await sleep(100);
        }
        const answeredMs = Date.now() - opened;
        await set({ reveal: true });
        onStep({ position, settled: settled(position), expected, answeredMs });
        await sleep(options.revealMs);
      }
    },

    /**
     * A student-paced room (#404): opens the whole set, waits until every participant has answered
     * or passed every item (or the set times out, a step's timeout for each item), then shows the
     * answers. Reported as one step, position 0: the room is never on one item.
     */
    async runPaced({ settled, expected, onStep, stopped }) {
      const all = () => {
        let total = 0;
        for (let position = 1; position <= this.itemCount; position += 1)
          total += settled(position);
        return total;
      };
      const wanted = expected * this.itemCount;
      const opened = Date.now();
      await set({ status: "running", current_position: 1, reveal: false });
      while (
        all() < wanted &&
        Date.now() - opened < options.stepTimeoutMs * this.itemCount &&
        !stopped()
      ) {
        await sleep(100);
      }
      const answeredMs = Date.now() - opened;
      await set({ reveal: true });
      onStep({ position: 0, settled: all(), expected: wanted, answeredMs });
      await sleep(options.revealMs);
    },

    async end() {
      await stopWatching?.();
      await client.rpc("end_session", { target: sessionId });
      await client.auth.signOut();
    },
  };
}
