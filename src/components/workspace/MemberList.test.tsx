import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import type { WorkspaceMember } from "@/lib/supabase/workspace";
import { removeWarning } from "@/lib/workspace/membership";
import { MemberList } from "./MemberList";

const members: WorkspaceMember[] = [
  {
    profileId: "p1",
    displayName: "Ada Lovelace",
    email: "ada@school.edu",
    role: "admin",
    joinedAt: "2026-10-01T10:00:00Z",
  },
  {
    profileId: "p2",
    displayName: null,
    email: "kim@school.edu",
    role: "instructor",
    joinedAt: "2026-10-08T23:30:00Z",
  },
  {
    profileId: "p3",
    displayName: "Mary Seacole",
    email: "mary@school.edu",
    role: "instructor",
    joinedAt: "2026-10-09T08:00:00Z",
  },
];

type RemoveAction = () => Promise<ConfirmOutcome | void>;

/** The page's `removeActionFor`: one action per colleague, each recording that it ran. */
function removal(outcome: ConfirmOutcome | void = { ok: true }) {
  const ran = vi.fn<(memberId: string) => void>();
  const removeActionFor = (memberId: string): RemoveAction => {
    return async () => {
      ran(memberId);
      return outcome;
    };
  };
  return { ran, removeActionFor };
}

afterEach(() => {
  document.documentElement.style.overflow = "";
});

describe("MemberList", () => {
  it("lists each member with a name, an address, a role and the day they joined", () => {
    render(<MemberList members={members} viewerId="p1" />);
    const rows = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Ada Lovelace");
    expect(rows[0]).toHaveTextContent("ada@school.edu");
    expect(rows[0]).toHaveTextContent("Admin");
    expect(rows[0]).toHaveTextContent("Joined Oct 1, 2026");
    expect(rows[1]).toHaveTextContent("kim@school.edu");
    expect(rows[1]).toHaveTextContent("Teacher");
    expect(rows[1]).toHaveTextContent("Joined Oct 8, 2026");
  });

  it("marks the viewer's own row and no other", () => {
    render(<MemberList members={members} viewerId="p2" />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).not.toHaveTextContent("(you)");
    expect(rows[1]).toHaveTextContent("(you)");
  });

  it("draws a name and an address that look like markup as text", () => {
    const hostile: WorkspaceMember = {
      profileId: "p9",
      displayName: '<script>alert("name")</script><b>Bold</b>',
      email: '"><img src=x onerror=alert(1)>@school.edu',
      role: "instructor",
      joinedAt: "2026-10-08T10:00:00Z",
    };
    const { removeActionFor } = removal();
    const { container } = render(
      <MemberList
        members={[members[0]!, hostile]}
        viewerId="p1"
        founderId="p1"
        removeActionFor={removeActionFor}
      />,
    );
    const row = screen.getAllByRole("listitem")[1]!;
    expect(row).toHaveTextContent(hostile.displayName!);
    expect(row).toHaveTextContent(hostile.email);
    expect(container.querySelector("script, img, b")).toBeNull();
  });
});

describe("MemberList, the founder", () => {
  it("says who started the workspace, on that row only", () => {
    render(<MemberList members={members} viewerId="p2" founderId="p1" />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Started this workspace");
    expect(rows[1]).not.toHaveTextContent("Started this workspace");
    expect(rows[2]).not.toHaveTextContent("Started this workspace");
  });

  it("marks nobody when the workspace has no founder on record", () => {
    render(<MemberList members={members} viewerId="p1" founderId={null} />);
    expect(screen.queryByText("Started this workspace")).not.toBeInTheDocument();
  });

  it("offers the founder a Remove for each colleague, and none for themselves", () => {
    const { removeActionFor } = removal();
    render(
      <MemberList
        members={members}
        viewerId="p1"
        founderId="p1"
        removeActionFor={removeActionFor}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole("button", { name: "Remove kim@school.edu from the workspace" }),
    ).toBeInTheDocument();
    expect(
      within(rows[2]!).getByRole("button", { name: "Remove Mary Seacole from the workspace" }),
    ).toBeInTheDocument();
  });

  it("offers nobody else a Remove, whatever the page hands in", () => {
    const { removeActionFor } = removal();
    render(
      <MemberList
        members={members}
        viewerId="p2"
        founderId="p1"
        removeActionFor={removeActionFor}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["no founder on record", null, true],
    ["no action from the page", "p1", false],
  ])("offers no Remove with %s", (_why, founderId, withAction) => {
    const { removeActionFor } = removal();
    render(
      <MemberList
        members={members}
        viewerId="p1"
        founderId={founderId}
        removeActionFor={withAction ? removeActionFor : undefined}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("MemberList, removing a colleague", () => {
  function renderAsFounder(outcome?: ConfirmOutcome | void) {
    const made = removal(outcome);
    render(
      <>
        <h2 id="members-heading" tabIndex={-1}>
          Members
        </h2>
        <MemberList
          members={members}
          viewerId="p1"
          founderId="p1"
          removeActionFor={made.removeActionFor}
          focusAfterRemove="members-heading"
        />
      </>,
    );
    return made;
  }

  const openFor = async (name: string) => {
    await userEvent.click(
      screen.getByRole("button", { name: `Remove ${name} from the workspace` }),
    );
    return screen.getByRole("dialog", { name: `Remove ${name}?` });
  };

  it("asks first, saying plainly what removing does, and removes nobody yet", async () => {
    const { ran } = renderAsFounder();
    const dialog = await openFor("Mary Seacole");
    expect(dialog).toHaveAccessibleDescription(removeWarning("Mary Seacole"));
    expect(dialog).toHaveTextContent("a new, empty workspace of their own");
    expect(ran).not.toHaveBeenCalled();
  });

  it("removes nobody on Cancel, and closes", async () => {
    const { ran } = renderAsFounder();
    const dialog = await openFor("Mary Seacole");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ran).not.toHaveBeenCalled();
  });

  it("removes nobody on Escape", async () => {
    const { ran } = renderAsFounder();
    await openFor("Mary Seacole");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ran).not.toHaveBeenCalled();
  });

  it("removes the colleague of that row on confirming, closes and moves focus to the heading", async () => {
    const { ran } = renderAsFounder();
    const dialog = await openFor("kim@school.edu");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from workspace" }));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(ran).toHaveBeenCalledWith("p2");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Members" })).toHaveFocus());
  });

  it("keeps the question open with the reason when the server refuses", async () => {
    const { ran } = renderAsFounder({ ok: false, message: "That person is no longer a member." });
    const dialog = await openFor("Mary Seacole");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from workspace" }));
    expect(ran).toHaveBeenCalledWith("p3");
    expect(await within(dialog).findByText("That person is no longer a member.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says so when the action throws, and lets the founder try again", async () => {
    const action = vi
      .fn<RemoveAction>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true });
    render(
      <MemberList members={members} viewerId="p1" founderId="p1" removeActionFor={() => action} />,
    );
    const dialog = await openFor("Mary Seacole");
    const confirm = within(dialog).getByRole("button", { name: "Remove from workspace" });
    await userEvent.click(confirm);
    expect(await within(dialog).findByText("That did not work. Try again.")).toBeVisible();
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("drops a second press while the first is in flight", async () => {
    let finish: (outcome: ConfirmOutcome) => void = () => {};
    const action = vi.fn<RemoveAction>(
      () => new Promise<ConfirmOutcome>((resolve) => (finish = resolve)),
    );
    render(
      <MemberList members={members} viewerId="p1" founderId="p1" removeActionFor={() => action} />,
    );
    const dialog = await openFor("Mary Seacole");
    const confirm = within(dialog).getByRole("button", { name: "Remove from workspace" });
    await userEvent.click(confirm);
    await userEvent.click(within(dialog).getByRole("button", { name: "Removing…" }));
    // Cancel does not close a dialog whose request is still out.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
