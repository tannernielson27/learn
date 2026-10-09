import { describe, expect, it } from "vitest";
import {
  formatWorkspaceDate,
  isInviteExpired,
  memberCountLabel,
  memberRoleLabel,
  WORKSPACE_PATH,
} from "./workspace";

describe("the workspace page's words", () => {
  it("lives under /author, so the author check covers it", () => {
    expect(WORKSPACE_PATH).toBe("/author/workspace");
  });

  it("writes a date the same wherever it is rendered", () => {
    expect(formatWorkspaceDate("2026-10-09T23:30:00Z")).toBe("Oct 9, 2026");
    expect(formatWorkspaceDate("not a date")).toBe("");
  });

  it("calls an invitation expired from its last moment on", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(isInviteExpired("2026-10-09T12:00:01Z", now)).toBe(false);
    expect(isInviteExpired("2026-10-09T12:00:00Z", now)).toBe(true);
    expect(isInviteExpired("2026-10-01T12:00:00Z", now)).toBe(true);
    expect(isInviteExpired("not a date", now)).toBe(true);
  });

  it("names the two roles a member can have", () => {
    expect(memberRoleLabel("instructor")).toBe("Teacher");
    expect(memberRoleLabel("admin")).toBe("Admin");
  });

  it("counts members against the cap", () => {
    expect(memberCountLabel(3)).toBe("3 of 10 members");
  });
});
