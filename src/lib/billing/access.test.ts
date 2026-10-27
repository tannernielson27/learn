import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { toWorkspaceAccess, type WorkspaceAccessRow } from "./access";

const NONE: WorkspaceAccessRow = {
  has_access: false,
  source: "none",
  grant_kind: null,
  status: null,
  trial_end: null,
  current_period_end: null,
  cancel_at_period_end: false,
  is_founder: true,
};
const END = "2026-11-03T00:00:00+00:00";

describe("toWorkspaceAccess", () => {
  it("is null without a row: not a teacher of a workspace", () => {
    expect(toWorkspaceAccess(null)).toBeNull();
    expect(toWorkspaceAccess(undefined)).toBeNull();
  });

  it.each(["exempt", "grandfathered", "beta"] as const)("is free on a %s grant", (grant) => {
    expect(
      toWorkspaceAccess({ ...NONE, has_access: true, source: "grant", grant_kind: grant }),
    ).toEqual({ hasAccess: true, canManage: true, state: { kind: "free", grant } });
  });

  it("is free on a grant even with a subscription", () => {
    const row = {
      ...NONE,
      has_access: true,
      source: "grant",
      grant_kind: "beta",
      status: "active",
    };
    expect(toWorkspaceAccess(row)?.state).toEqual({ kind: "free", grant: "beta" });
  });

  it("is a trial that converts, or one that was cancelled", () => {
    const row = {
      ...NONE,
      has_access: true,
      source: "subscription",
      status: "trialing",
      trial_end: END,
    };
    expect(toWorkspaceAccess(row)?.state).toEqual({
      kind: "trial",
      endsAt: END,
      convertsToPaid: true,
    });
    expect(toWorkspaceAccess({ ...row, cancel_at_period_end: true })?.state).toEqual({
      kind: "trial",
      endsAt: END,
      convertsToPaid: false,
    });
  });

  it("is active and renews, or ends at the period's end once cancelled", () => {
    const row = {
      ...NONE,
      has_access: true,
      source: "subscription",
      status: "active",
      current_period_end: END,
    };
    expect(toWorkspaceAccess(row)?.state).toEqual({
      kind: "active",
      periodEndsAt: END,
      renews: true,
    });
    expect(toWorkspaceAccess({ ...row, cancel_at_period_end: true })?.state).toEqual({
      kind: "active",
      periodEndsAt: END,
      renews: false,
    });
  });

  it("is a failed payment while past due, with access kept", () => {
    const row = {
      ...NONE,
      has_access: true,
      source: "subscription",
      status: "past_due",
      current_period_end: END,
    };
    expect(toWorkspaceAccess(row)).toEqual({
      hasAccess: true,
      canManage: true,
      state: { kind: "payment_failed", periodEndsAt: END },
    });
  });

  it.each(["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"])(
    "is no access when %s",
    (status) => {
      expect(toWorkspaceAccess({ ...NONE, status })).toEqual({
        hasAccess: false,
        canManage: true,
        state: { kind: "none", status },
      });
    },
  );

  it("is no access with no subscription", () => {
    expect(toWorkspaceAccess(NONE)?.state).toEqual({ kind: "none", status: null });
  });

  it("lets only the founder manage billing", () => {
    expect(toWorkspaceAccess({ ...NONE, is_founder: false })?.canManage).toBe(false);
    expect(toWorkspaceAccess({ ...NONE, is_founder: null })?.canManage).toBe(false);
  });

  it("does not read a subscription status the source did not count", () => {
    expect(toWorkspaceAccess({ ...NONE, source: "none", status: "trialing" })?.state).toEqual({
      kind: "none",
      status: "trialing",
    });
  });

  it("does not invent a grant the database does not know", () => {
    expect(
      toWorkspaceAccess({ ...NONE, has_access: true, source: "grant", grant_kind: "vip" })?.state,
    ).toEqual({ kind: "none", status: null });
  });

  it("accepts the generated row type", () => {
    const generated: Database["public"]["Functions"]["workspace_access"]["Returns"][number] = {
      has_access: true,
      source: "subscription",
      grant_kind: "",
      status: "active",
      trial_end: "",
      current_period_end: END,
      cancel_at_period_end: false,
      is_founder: false,
    };
    expect(toWorkspaceAccess(generated)?.state.kind).toBe("active");
  });
});
