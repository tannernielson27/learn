import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OpenInvite } from "@/lib/supabase/workspace";
import { PendingInvites, RESEND_WARNING, REVOKE_WARNING } from "./PendingInvites";

const NOW = new Date("2026-10-09T12:00:00Z");

const invites: OpenInvite[] = [
  {
    id: "i1",
    email: "kim@school.edu",
    createdAt: "2026-10-08T10:00:00Z",
    expiresAt: "2026-10-15T10:00:00Z",
  },
  {
    id: "i2",
    email: "lee@school.edu",
    createdAt: "2026-09-28T10:00:00Z",
    expiresAt: "2026-10-05T10:00:00Z",
  },
];

const noop = () => async () => {};

describe("PendingInvites", () => {
  it("lists each invitation with when it was sent and when it runs out", () => {
    render(
      <PendingInvites invites={invites} now={NOW} revokeActionFor={noop} resendActionFor={noop} />,
    );
    const rows = within(screen.getByRole("list", { name: "Pending invitations" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("kim@school.edu");
    expect(rows[0]).toHaveTextContent("Sent Oct 8, 2026. Expires Oct 15, 2026.");
  });

  it("marks an invitation past its last day as expired, and still lists it", () => {
    render(
      <PendingInvites invites={invites} now={NOW} revokeActionFor={noop} resendActionFor={noop} />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("Sent Sep 28, 2026. Expired Oct 5, 2026.");
    expect(rows[0]).not.toHaveTextContent("Expired");
  });

  it("gives every row a Revoke and a Resend named for its address, bound to its id", () => {
    const revokeActionFor = vi.fn(noop);
    const resendActionFor = vi.fn(noop);
    render(
      <PendingInvites
        invites={invites}
        now={NOW}
        revokeActionFor={revokeActionFor}
        resendActionFor={resendActionFor}
      />,
    );
    for (const { id, email } of invites) {
      expect(
        screen.getByRole("button", { name: `Revoke the invitation to ${email}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Resend the invitation to ${email}` }),
      ).toBeInTheDocument();
      expect(revokeActionFor).toHaveBeenCalledWith(id);
      expect(resendActionFor).toHaveBeenCalledWith(id);
    }
  });

  it("asks before revoking, then runs that row's action", async () => {
    const user = userEvent.setup();
    const revoke = vi.fn(async () => ({ ok: true as const }));
    render(
      <PendingInvites
        invites={invites}
        now={NOW}
        revokeActionFor={(id) => (id === "i1" ? revoke : async () => {})}
        resendActionFor={noop}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Revoke the invitation to kim@school.edu" }),
    );
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByText(REVOKE_WARNING)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("asks before resending, saying the first link stops working", async () => {
    const user = userEvent.setup();
    const resend = vi.fn(async () => ({ ok: true as const }));
    render(
      <PendingInvites
        invites={invites}
        now={NOW}
        revokeActionFor={noop}
        resendActionFor={(id) => (id === "i2" ? resend : async () => {})}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Resend the invitation to lee@school.edu" }),
    );
    expect(resend).not.toHaveBeenCalled();
    expect(screen.getByText(RESEND_WARNING)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send a new invitation" }));
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("shows why a resend was refused, beside the button", async () => {
    const user = userEvent.setup();
    const message = "You have sent 5 invitations in the last 24 hours.";
    render(
      <PendingInvites
        invites={invites.slice(0, 1)}
        now={NOW}
        revokeActionFor={noop}
        resendActionFor={() => async () => ({ ok: false as const, message })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Resend the invitation to kim@school.edu" }),
    );
    await user.click(screen.getByRole("button", { name: "Send a new invitation" }));
    expect(await screen.findByText(message)).toBeVisible();
  });

  it("sends focus to the given heading after a confirmed revoke", async () => {
    const user = userEvent.setup();
    render(
      <>
        <h2 id="pending-heading" tabIndex={-1}>
          Pending invitations
        </h2>
        <PendingInvites
          invites={invites.slice(0, 1)}
          now={NOW}
          revokeActionFor={() => async () => ({ ok: true as const })}
          resendActionFor={noop}
          focusAfterChange="pending-heading"
        />
      </>,
    );
    await user.click(
      screen.getByRole("button", { name: "Revoke the invitation to kim@school.edu" }),
    );
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));
    expect(screen.getByRole("heading", { name: "Pending invitations" })).toHaveFocus();
  });

  it("says so when nothing is pending, with the way to the form", () => {
    render(
      <PendingInvites
        invites={[]}
        now={NOW}
        revokeActionFor={noop}
        resendActionFor={noop}
        emptyAction={{ href: "#invite-heading", label: "Invite a colleague" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No pending invitations" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Invite a colleague" })).toHaveAttribute(
      "href",
      "#invite-heading",
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("draws an address that looks like markup as text", () => {
    const hostile: OpenInvite = { ...invites[0]!, email: "<img src=x onerror=alert(1)>@x.test" };
    const { container } = render(
      <PendingInvites
        invites={[hostile]}
        now={NOW}
        revokeActionFor={noop}
        resendActionFor={noop}
      />,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent(hostile.email);
    expect(container.querySelector("img")).toBeNull();
  });
});
