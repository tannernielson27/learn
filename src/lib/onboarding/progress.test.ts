import { describe, expect, it, vi } from "vitest";
import { readOrgProgress } from "./progress";

type Reply = { data: unknown; error: { code?: string } | null };

function fakeClient(replies: Record<string, Reply>) {
  const asked: { table: string; eq: unknown[][]; limit: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const entry = { table, eq: [] as unknown[][], limit: [] as unknown[] };
    asked.push(entry);
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (...args: unknown[]) => {
        entry.eq.push(args);
        return chain;
      },
      limit: (n: unknown) => {
        entry.limit.push(n);
        return chain;
      },
      then: (resolve: (value: Reply) => unknown) =>
        resolve(replies[table] ?? { data: [], error: null }),
    };
    return chain;
  });
  return { client: { from } as never, asked };
}

const ORG = "00000000-0000-4000-8000-000000000001";
const BANKS = [{ id: "00000000-0000-4000-8000-0000000000b1", name: "Cardiac" }];
const ROW = { data: [{ id: "x" }], error: null };

describe("readOrgProgress", () => {
  it("reads nothing but one row of each table, in the caller's org", async () => {
    const fake = fakeClient({});
    expect(await readOrgProgress(fake.client, ORG, [])).toEqual({
      banks: [],
      hasClass: false,
      hasAssignmentOrSession: false,
    });
    expect(fake.asked.map((entry) => entry.table).sort()).toEqual([
      "assignments",
      "classes",
      "sessions",
    ]);
    for (const entry of fake.asked) {
      expect(entry.eq).toEqual([["org_id", ORG]]);
      expect(entry.limit).toEqual([1]);
    }
  });

  it("counts a class, and either an assignment or a live session", async () => {
    expect(
      await readOrgProgress(fakeClient({ classes: ROW, assignments: ROW }).client, ORG, BANKS),
    ).toEqual({ banks: BANKS, hasClass: true, hasAssignmentOrSession: true });
    expect(await readOrgProgress(fakeClient({ sessions: ROW }).client, ORG, BANKS)).toMatchObject({
      hasClass: false,
      hasAssignmentOrSession: true,
    });
  });

  it("is null when any read fails, so the page shows no wrong checklist", async () => {
    const failed = { data: null, error: { code: "08006" } };
    expect(await readOrgProgress(fakeClient({ sessions: failed }).client, ORG, BANKS)).toBeNull();
  });
});
