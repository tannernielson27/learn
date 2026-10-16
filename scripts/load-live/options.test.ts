import { describe, expect, it } from "vitest";
import { readOptions } from "./options.mjs";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
};

describe("readOptions", () => {
  it("fills in a class of sixty by default", () => {
    const options = readOptions(["--code", "abc 234"], ENV);
    expect(options).toMatchObject({
      base: "http://127.0.0.1:3000",
      code: "ABC234",
      participants: 60,
      blank: 0.1,
      thinkMs: [1000, 6000],
      rampMs: 5000,
      out: "./load-live-results.json",
      host: false,
      supabaseUrl: "http://127.0.0.1:55321",
      publishableKey: "sb_publishable_x",
      maxMinutes: 30,
      lobbyMs: 3000,
    });
  });

  it("takes every flag", () => {
    const options = readOptions(
      [
        "--base=http://127.0.0.1:3107/",
        "--participants",
        "5",
        "--blank",
        "0",
        "--think",
        "10-20",
        "--ramp",
        "0",
        "--seed",
        "9",
        "--out",
        "x.json",
        "--host",
        "--case-study",
        "00000000-0000-4000-8000-000000000003",
        "--lobby-ms",
        "0",
        "--reveal-ms",
        "100",
        "--step-timeout",
        "5000",
        "--supabase-url",
        "http://localhost:55321",
        "--publishable-key",
        "k",
      ],
      {},
    );
    expect(options).toMatchObject({
      base: "http://127.0.0.1:3107",
      participants: 5,
      blank: 0,
      thinkMs: [10, 20],
      rampMs: 0,
      seed: 9,
      out: "x.json",
      host: true,
      source: { kind: "case_study", id: "00000000-0000-4000-8000-000000000003" },
      lobbyMs: 0,
      revealMs: 100,
      stepTimeoutMs: 5000,
      supabaseUrl: "http://localhost:55321",
      publishableKey: "k",
    });
  });

  it("runs phones without a presence listener unless asked, as the app does since #426", () => {
    expect(readOptions(["--code", "ABC234"], ENV).studentPresence).toBe(false);
    expect(readOptions(["--code", "ABC234", "--student-presence", "on"], ENV).studentPresence).toBe(
      true,
    );
    expect(readOptions(["--code", "ABC234", "--student-presence=off"], ENV).studentPresence).toBe(
      false,
    );
    expect(() => readOptions(["--code", "ABC234", "--student-presence", "yes"], ENV)).toThrow(
      /--student-presence must be on or off/,
    );
  });

  it("defaults --host to the seeded sample case study", () => {
    expect(readOptions(["--host"], ENV).source).toEqual({
      kind: "case_study",
      id: "00000000-0000-4000-8000-000000000003",
    });
    expect(readOptions(["--host", "--bank", "b"], ENV).source).toEqual({ kind: "bank", id: "b" });
  });

  it("runs a bank student-paced only when asked (#404)", () => {
    expect(readOptions(["--host", "--bank", "b"], ENV).paced).toBe(false);
    expect(readOptions(["--host", "--bank", "b", "--paced"], ENV)).toMatchObject({
      paced: true,
      source: { kind: "bank", id: "b" },
    });
  });

  it.each([
    [[], /--code/],
    [["--code", "ABC234", "--host"], /either --code or --host/],
    [["--code", "nope"], /six-character/],
    [["--code", "ABC234", "--participants", "0"], /--participants/],
    [["--code", "ABC234", "--participants", "301"], /--participants/],
    [["--code", "ABC234", "--blank", "1.5"], /--blank/],
    [["--code", "ABC234", "--think", "5-1"], /--think/],
    [["--host", "--bank", "a", "--case-study", "b"], /not both/],
    [["--host", "--paced"], /--paced needs --host and --bank/],
    [["--host", "--paced", "--case-study", "b"], /--paced needs --host and --bank/],
    [["--code", "ABC234", "--paced"], /--paced needs --host and --bank/],
    [["--code", "ABC234", "--nonsense"], /nonsense/],
  ])("refuses %j", (argv, message) => {
    expect(() => readOptions(argv, ENV)).toThrow(message);
  });

  it("refuses a run with nowhere to open the sockets", () => {
    expect(() => readOptions(["--code", "ABC234"], {})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
