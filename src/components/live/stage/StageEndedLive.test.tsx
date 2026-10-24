import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rankPodium, type Podium } from "@/lib/live/podium";
import { loadPodium, StageEndedLive } from "./StageEndedLive";

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const SUMMARY = { questionsRun: 2, itemCount: 2, joined: 3 };
const PODIUM = rankPodium([{ participantId: "p-1", displayName: "Ava", points: 3 }]) as Podium;

afterEach(() => vi.unstubAllGlobals());

describe("StageEndedLive", () => {
  it("shows the summary while the top 5 is on its way, then the podium", async () => {
    let resolve: (podium: Podium | null) => void = () => {};
    const load = vi.fn(() => new Promise<Podium | null>((r) => (resolve = r)));
    render(
      <StageEndedLive sessionId={SESSION} title="T" summary={SUMMARY} rate={50} load={load} />,
    );
    expect(load).toHaveBeenCalledWith(SESSION, expect.any(AbortSignal));
    expect(screen.getByText(/of answers sent/)).toBeInTheDocument();
    resolve(PODIUM);
    expect(await screen.findByRole("heading", { name: "Top 5" })).toBeInTheDocument();
    expect(screen.getByText("Ava")).toBeInTheDocument();
  });

  it("keeps the summary when there is no podium", async () => {
    const load = vi.fn(async () => null);
    render(
      <StageEndedLive sessionId={SESSION} title="T" summary={SUMMARY} rate={null} load={load} />,
    );
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Top 5" })).toBeNull();
  });

  it("asks for nothing without a session id, and shows the summary", () => {
    const load = vi.fn(async () => PODIUM);
    render(<StageEndedLive title="T" summary={SUMMARY} rate={null} load={load} />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
  });
});

describe("loadPodium", () => {
  const signal = new AbortController().signal;

  it("reads the podium route with the teacher's own cookies, never cached", async () => {
    const fetch = vi.fn(async () => Response.json({ podium: PODIUM }));
    vi.stubGlobal("fetch", fetch);
    expect(await loadPodium(SESSION, signal)).toEqual(PODIUM);
    expect(fetch).toHaveBeenCalledWith(
      `/live/${SESSION}/podium`,
      expect.objectContaining({ cache: "no-store", credentials: "same-origin", signal }),
    );
  });

  it("reads a refusal, a failure or a strange body as no podium", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "no" }, { status: 404 })),
    );
    expect(await loadPodium(SESSION, signal)).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200 })),
    );
    expect(await loadPodium(SESSION, signal)).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    expect(await loadPodium(SESSION, signal)).toBeNull();
  });
});
