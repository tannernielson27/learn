import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { readWorkspaceAccess } from "./workspaceAccess";

function client(reply: { data: unknown; error: { code?: string } | null }) {
  return { rpc: vi.fn(async () => reply) } as unknown as SupabaseClient<Database>;
}

describe("readWorkspaceAccess", () => {
  it("maps the one row", async () => {
    const access = await readWorkspaceAccess(
      client({
        data: [
          {
            has_access: true,
            source: "subscription",
            grant_kind: null,
            status: "active",
            trial_end: null,
            current_period_end: "2026-12-03T15:00:00Z",
            cancel_at_period_end: false,
            is_founder: true,
          },
        ],
        error: null,
      }),
    );
    expect(access).toEqual({
      hasAccess: true,
      canManage: true,
      state: { kind: "active", periodEndsAt: "2026-12-03T15:00:00Z", renews: true },
    });
  });

  it("is null for no row, and for a failure, logging only the code", async () => {
    expect(await readWorkspaceAccess(client({ data: [], error: null }))).toBeNull();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await readWorkspaceAccess(client({ data: null, error: { code: "PGRST202" } })),
    ).toBeNull();
    expect(logged).toHaveBeenCalledWith("[billing] workspace_access could not answer", {
      code: "PGRST202",
    });
    logged.mockRestore();
  });
});
