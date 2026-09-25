import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import { SessionList } from "./SessionList";

const ended: SessionSummary = {
  id: "00000000-0000-4000-8000-0000000000a1",
  title: "Cardiac week 3",
  status: "ended",
  openedAt: "2026-09-22T10:00:00Z",
  closedAt: "2026-09-22T10:40:00Z",
  participantCount: 24,
};

const running: SessionSummary = {
  ...ended,
  id: "00000000-0000-4000-8000-0000000000a2",
  title: "Respiratory drill",
  status: "running",
  closedAt: null,
  participantCount: 1,
};

describe("SessionList", () => {
  it("links an ended session to its report, with its date and roster size", () => {
    render(<SessionList sessions={[ended]} />);
    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("link", { name: /Cardiac week 3/ })).toHaveAttribute(
      "href",
      `/live/${ended.id}/report`,
    );
    expect(item).toHaveTextContent("Sep 22, 2026");
    expect(item).toHaveTextContent("24 participants");
    expect(item).toHaveTextContent("Ended");
  });

  it("links a session still open back to its console, since there is no report yet", () => {
    render(<SessionList sessions={[running]} />);
    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("link", { name: /Respiratory drill/ })).toHaveAttribute(
      "href",
      `/live/${running.id}`,
    );
    expect(item).toHaveTextContent("1 participant");
    expect(item).toHaveTextContent("Running");
  });

  it("says so when there are no sessions yet", () => {
    render(<SessionList sessions={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "No live sessions yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Start one from a bank/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your item banks" })).toHaveAttribute(
      "href",
      "/author",
    );
  });
});
