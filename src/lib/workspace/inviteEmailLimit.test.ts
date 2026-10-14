import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_BUCKETS, RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { WORKSPACE_INVITE_EMAIL_LIMITS, takeWorkspaceInviteEmail } from "./inviteEmailLimit";

const ADA = "00000000-0000-4000-8000-0000000000a1";
const GRACE = "00000000-0000-4000-8000-0000000000b1";

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
beforeEach(() => {
  logged.mockClear();
  warned.mockClear();
});

describe("takeWorkspaceInviteEmail", () => {
  it("holds the owner's numbers: five a person a day, and a ceiling for everyone", () => {
    expect(WORKSPACE_INVITE_EMAIL_LIMITS).toEqual({
      perInviter: { attempts: 5, windowMs: 24 * 60 * 60 * 1000 },
      deployment: { attempts: 50, windowMs: 60 * 60 * 1000 },
    });
    // private.hit_rate_limit refuses a window longer than a day.
    expect(WORKSPACE_INVITE_EMAIL_LIMITS.perInviter.windowMs / 1000).toBeLessThanOrEqual(86400);
  });

  it("allows one inviter five in a day and refuses the sixth, without touching anyone else", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < 5; i += 1) {
      expect(await takeWorkspaceInviteEmail(ADA, store)).toBe("ok");
    }
    expect(await takeWorkspaceInviteEmail(ADA, store)).toBe("rate_limited");
    expect(await takeWorkspaceInviteEmail(GRACE, store)).toBe("ok");
  });

  it("gives the inviter their five back a day after the first", async () => {
    let now = 0;
    const store = createMemoryRateLimitStore({ now: () => now });
    for (let i = 0; i < 6; i += 1) await takeWorkspaceInviteEmail(ADA, store);
    now = 24 * 60 * 60 * 1000 - 1;
    expect(await takeWorkspaceInviteEmail(ADA, store)).toBe("rate_limited");
    now += 1;
    expect(await takeWorkspaceInviteEmail(ADA, store)).toBe("ok");
  });

  it("does not let an inviter past their five spend the ceiling everybody shares", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < 20; i += 1) await takeWorkspaceInviteEmail(ADA, store);
    const ceilingHits = store.hits().filter((hit) => hit.bucket === "workspace_invite_email");
    expect(ceilingHits).toHaveLength(5);
  });

  it("refuses everyone once the deployment's ceiling is reached, out loud", async () => {
    const store = createMemoryRateLimitStore();
    const { attempts } = WORKSPACE_INVITE_EMAIL_LIMITS.deployment;
    for (let i = 0; i < attempts; i += 1) {
      expect(await takeWorkspaceInviteEmail(`inviter-${i}`, store)).toBe("ok");
    }
    expect(await takeWorkspaceInviteEmail("one-more", store)).toBe("ceiling");
    expect(warned).toHaveBeenCalledTimes(1);
  });

  it("keys on the account and the deployment, in buckets the store knows", async () => {
    const store = createMemoryRateLimitStore();
    await takeWorkspaceInviteEmail(ADA, store);
    expect(store.hits()).toEqual([
      { bucket: "workspace_invite_inviter", key: ADA },
      { bucket: "workspace_invite_email", key: "deployment" },
    ]);
    for (const { bucket } of store.hits()) expect(RATE_LIMIT_BUCKETS).toContain(bucket);
  });

  it("sends nothing when the shared store cannot answer", async () => {
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("PGRST301"));
    expect(await takeWorkspaceInviteEmail(ADA, store)).toBe("unavailable");
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
