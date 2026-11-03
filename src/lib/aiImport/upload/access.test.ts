import { describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import { aiImportAccess } from "./access";

/** #521: AI import needs access as well as its switches when billing is enforced. */

function author(readOnly: unknown): () => Promise<RouteAuthor> {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { ai_import_enabled: true }, error: null }) }),
    }),
  }));
  return async () =>
    ({
      status: "ok",
      supabase: { from },
      userId: "u",
      email: "e@x.test",
      orgId: "o",
      readOnly,
    }) as unknown as RouteAuthor;
}

const env = { AI_IMPORT_ENABLED: "true", ANTHROPIC_API_KEY: "sk-ant-test" };

describe("aiImportAccess and billing (#521)", () => {
  it("is off for a read-only workspace, whatever its own switch says", async () => {
    const access = await aiImportAccess({
      author: author({ readOnly: true, canManage: true }),
      env,
    });
    expect(access).toEqual({ status: "disabled" });
  });

  it("is unchanged for a workspace that may write", async () => {
    const access = await aiImportAccess({ author: author(null), env });
    expect(access.status).not.toBe("disabled");
  });
});
