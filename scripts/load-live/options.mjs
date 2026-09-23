// #187: the load script's command line. Pure, so `options.test.ts` can pin it.

import { parseArgs } from "node:util";

/** `supabase/seed.sql`'s sample case study: six steps, the same id on every local stack. */
export const SAMPLE_CASE_STUDY_ID = "00000000-0000-4000-8000-000000000003";

/** `private.session_is_full` stops a session at 300. */
const MAX_PARTICIPANTS = 300;

/** The same alphabet as `src/lib/live/sessionCode.ts`: no 0, 1, I or O. */
const SESSION_CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export const USAGE = `Usage: pnpm load:live (--code ABC234 | --host) [options]

  --code <code>            join the session with this code; a person runs the host console
  --host                   start and drive a session as an instructor (local stack: the demo account)
  --case-study <id>        with --host: the case study to run (default: the seeded sample)
  --bank <id>              with --host: run a bank instead
  --base <url>             the app (default http://127.0.0.1:3000)
  --participants <n>       class size (default 60, at most ${MAX_PARTICIPANTS})
  --blank <share>          share of answers left blank, 0 to 1 (default 0.1)
  --think <min-max>        milliseconds each participant takes to answer (default 1000-6000)
  --ramp <ms>              joins are spread over this long (default 5000)
  --seed <n>               repeat a run's answers exactly
  --lobby-ms <ms>          with --host: pause in the lobby once everyone is in (default 3000)
  --reveal-ms <ms>         with --host: how long a reveal stays up (default 2000)
  --step-timeout <ms>      with --host: longest wait for a step's answers (default 30000)
  --max-minutes <n>        give up after this long (default 30)
  --out <path>             results JSON (default ./load-live-results.json)
  --supabase-url <url>     default NEXT_PUBLIC_SUPABASE_URL
  --publishable-key <key>  default NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;

const OPTIONS = {
  code: { type: "string" },
  host: { type: "boolean", default: false },
  "case-study": { type: "string" },
  bank: { type: "string" },
  base: { type: "string", default: "http://127.0.0.1:3000" },
  participants: { type: "string", default: "60" },
  blank: { type: "string", default: "0.1" },
  think: { type: "string", default: "1000-6000" },
  ramp: { type: "string", default: "5000" },
  seed: { type: "string" },
  "lobby-ms": { type: "string", default: "3000" },
  "reveal-ms": { type: "string", default: "2000" },
  "step-timeout": { type: "string", default: "30000" },
  "max-minutes": { type: "string", default: "30" },
  out: { type: "string", default: "./load-live-results.json" },
  "supabase-url": { type: "string" },
  "publishable-key": { type: "string" },
  help: { type: "boolean", default: false },
};

function wholeNumber(value, flag, min, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${flag} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function thinkRange(value) {
  const match = /^(\d+)-(\d+)$/.exec(value);
  const [min, max] = match ? [Number(match[1]), Number(match[2])] : [NaN, NaN];
  if (!(min <= max)) throw new Error("--think must look like 1000-6000, smaller number first.");
  return [min, max];
}

function source(values) {
  if (values.bank && values["case-study"]) {
    throw new Error("Pass --bank or --case-study, not both.");
  }
  if (values.bank) return { kind: "bank", id: values.bank };
  return { kind: "case_study", id: values["case-study"] ?? SAMPLE_CASE_STUDY_ID };
}

function sessionCode(values) {
  if (values.host && values.code) throw new Error("Pass either --code or --host, not both.");
  if (values.host) return null;
  if (!values.code)
    throw new Error("Pass --code <code> for a session a person is hosting, or --host.");
  const code = values.code.replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (!SESSION_CODE.test(code)) throw new Error("--code must be the six-character join code.");
  return code;
}

/** Reads argv (without `node` and the script) and the environment into one options object. */
export function readOptions(argv, env) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true });
  if (values.help) return { help: true };

  const blank = Number(values.blank);
  if (!(blank >= 0 && blank <= 1)) throw new Error("--blank must be a share from 0 to 1.");

  const supabaseUrl = values["supabase-url"] ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = values["publishable-key"] ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or pass " +
        "--supabase-url and --publishable-key): each participant opens its own Realtime socket.",
    );
  }

  return {
    help: false,
    code: sessionCode(values),
    host: values.host,
    source: values.host ? source(values) : null,
    base: values.base.replace(/\/+$/, ""),
    participants: wholeNumber(values.participants, "--participants", 1, MAX_PARTICIPANTS),
    blank,
    thinkMs: thinkRange(values.think),
    rampMs: wholeNumber(values.ramp, "--ramp", 0),
    seed: values.seed === undefined ? Date.now() % 2 ** 31 : wholeNumber(values.seed, "--seed", 0),
    lobbyMs: wholeNumber(values["lobby-ms"], "--lobby-ms", 0),
    revealMs: wholeNumber(values["reveal-ms"], "--reveal-ms", 0),
    stepTimeoutMs: wholeNumber(values["step-timeout"], "--step-timeout", 1000),
    maxMinutes: wholeNumber(values["max-minutes"], "--max-minutes", 1, 240),
    out: values.out,
    supabaseUrl,
    publishableKey,
  };
}
