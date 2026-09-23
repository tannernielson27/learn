// #187: `--host` — an instructor that starts a session and walks it through every item, so a load
// run can go end to end with nobody at the host console.
//
// It signs in as a real instructor and does what the host console does, under that instructor's
// own row level security: `start_session` to open the room, then writes `status`,
// `current_position` and `reveal` on the session row the way `hostTransport.ts` does (the
// `guard_session_change` trigger holds it to the same transitions), and `end_session` at the end.
// It never touches the service role.

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

export async function openHostedSession({ options, credentials }) {
  const client = createClient(options.supabaseUrl, options.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword(credentials);
  if (signedIn.error)
    throw new Error(`The host could not sign in (${signedIn.error.status ?? "error"}).`);

  const args =
    options.source.kind === "bank"
      ? { source_bank: options.source.id }
      : { source_case_study: options.source.id };
  const started = await client.rpc("start_session", args);
  if (started.error) throw new Error(`start_session refused: ${started.error.message}`);
  const sessionId = started.data;

  const read = await client.from("sessions").select("code, item_set").eq("id", sessionId).single();
  if (read.error) throw new Error("The new session could not be read back.");

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

    async end() {
      await client.rpc("end_session", { target: sessionId });
      await client.auth.signOut();
    },
  };
}
