import { vi } from "vitest";
import type { AuthorSession, RouteAuthor } from "@/lib/authoring/session";
import type { Client } from "../access";

/**
 * Test-only Supabase stand-ins for the upload routes and Server Functions (#345). Each query on
 * a table answers with the next scripted reply for that table, in order, and every builder step
 * is recorded so a test can check the filters (the workspace, above all).
 */

export type Reply = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number;
};

const STEPS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "or",
  "order",
  "limit",
  "single",
  "maybeSingle",
];

export function fakeClient(tables: Record<string, Reply[]>) {
  const calls: [string, string, unknown[]][] = [];
  const queues = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]));
  const from = vi.fn((table: string) => {
    const reply = queues[table]?.shift();
    if (!reply) throw new Error(`unexpected query on ${table}`);
    const builder: Record<string, unknown> = {};
    for (const step of STEPS) {
      builder[step] = (...args: unknown[]) => {
        calls.push([table, step, args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: Reply) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve({ error: null, ...reply }).then(resolve, reject);
    return builder;
  });
  const client = { from } as unknown as Client;
  const stepsOn = (table: string, step: string) =>
    calls.filter(([t, s]) => t === table && s === step).map(([, , args]) => args);
  const left = () => Object.entries(queues).filter(([, replies]) => replies.length > 0);
  return { client, from, calls, stepsOn, left };
}

export const ORG = "00000000-0000-4000-8000-0000000000a1";
export const OTHER_ORG = "00000000-0000-4000-8000-0000000000a2";
export const USER = "00000000-0000-4000-8000-0000000000c1";
export const BANK = "00000000-0000-4000-8000-0000000000d1";
export const BATCH = "00000000-0000-4000-8000-0000000000b1";
export const FILE = "00000000-0000-4000-8000-0000000000f1";

/** A teacher whose own session reads their workspace's AI import switch as `enabled`. */
export function teacher(
  enabled = true,
  extra: Record<string, Reply[]> = {},
): { author: RouteAuthor; session: ReturnType<typeof fakeClient> } {
  const session = fakeClient({
    // One answer per call a test makes with this teacher.
    orgs: Array.from({ length: 8 }, () => ({ data: { ai_import_enabled: enabled } })),
    ...extra,
  });
  return {
    author: {
      status: "ok",
      supabase: session.client as unknown as AuthorSession["supabase"],
      userId: USER,
      email: "teacher@example.test",
      orgId: ORG,
    },
    session,
  };
}

export const ON = { AI_IMPORT_ENABLED: "true", AI_IMPORT_FAKE: "1" } as const;
export const OFF = { AI_IMPORT_ENABLED: "false", AI_IMPORT_FAKE: "1" } as const;
