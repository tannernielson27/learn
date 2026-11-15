import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import { ManagedSessionList } from "./ManagedSessionList";

vi.mock("@/app/author/sessions/actions", () => ({
  renameSessionAction: vi.fn(async () => ({ ok: true, count: 1 })),
  archiveSessionsAction: vi.fn(async (ids: string[]) => ({ ok: true, count: ids.length })),
  restoreSessionsAction: vi.fn(async (ids: string[]) => ({ ok: true, count: ids.length })),
}));

const ME = "host-me";
const session = (
  id: string,
  title: string,
  extra: Partial<SessionSummary> = {},
): SessionSummary => ({
  id,
  title,
  status: "ended",
  openedAt: "2026-11-10T10:00:00Z",
  closedAt: "2026-11-10T10:30:00Z",
  participantCount: 12,
  hostId: ME,
  archivedAt: null,
  ...extra,
});

const groups = [
  {
    label: "This week",
    sessions: [
      session("a", "Mine, ended"),
      session("b", "Mine, running", { status: "running", closedAt: null }),
      session("c", "A colleague's", { hostId: "someone-else" }),
    ],
  },
];

describe("ManagedSessionList (#565)", () => {
  it("offers actions only on the viewer's own sessions", () => {
    render(<ManagedSessionList groups={groups} viewerId={ME} archivedView={false} />);
    expect(
      screen.getByRole("button", { name: "More actions for Mine, ended" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More actions for Mine, running" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More actions for A colleague/ })).toBeNull();
  });

  it("offers Archive only once a session has ended", async () => {
    const user = userEvent.setup();
    render(<ManagedSessionList groups={groups} viewerId={ME} archivedView={false} />);
    await user.click(screen.getByRole("button", { name: "More actions for Mine, running" }));
    expect(screen.getByRole("button", { name: "Rename" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("archives from the row and offers Undo", async () => {
    const user = userEvent.setup();
    render(<ManagedSessionList groups={groups} viewerId={ME} archivedView={false} />);
    await user.click(screen.getByRole("button", { name: "More actions for Mine, ended" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Archived 1 live session.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("lets only the viewer's ended sessions be selected for archiving", async () => {
    const user = userEvent.setup();
    render(<ManagedSessionList groups={groups} viewerId={ME} archivedView={false} />);
    await user.click(screen.getByRole("button", { name: "Select to archive" }));
    const list = screen.getByRole("list", { name: "This week" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(list).getByRole("checkbox", { name: "Select Mine, ended" })).toBeInTheDocument();
  });

  it("offers Restore in the Archived view", async () => {
    const user = userEvent.setup();
    render(<ManagedSessionList groups={groups} viewerId={ME} archivedView />);
    await user.click(screen.getByRole("button", { name: "More actions for Mine, ended" }));
    expect(screen.getByRole("button", { name: "Restore" })).toBeVisible();
  });
});
