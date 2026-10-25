import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rankPodium, type Podium } from "@/lib/live/podium";
import { loadPodium, PODIUM_LATER, StageEndedLive, type PodiumLoader } from "./StageEndedLive";

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const SUMMARY = { questionsRun: 2, itemCount: 2, joined: 3 };
const PODIUM = rankPodium([{ participantId: "p-1", displayName: "Ava", points: 3 }]) as Podium;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  describe("when the top 5 is not ready yet", () => {
    /** Lets the pending load settle and React render, then moves the clock on. */
    const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    it("asks again 1.5 s and then 3 s later, and shows the podium once it is there", async () => {
      vi.useFakeTimers();
      const load = vi
        .fn<PodiumLoader>()
        .mockResolvedValueOnce(PODIUM_LATER)
        .mockResolvedValueOnce(PODIUM_LATER)
        .mockResolvedValueOnce(PODIUM);
      render(
        <StageEndedLive sessionId={SESSION} title="T" summary={SUMMARY} rate={null} load={load} />,
      );
      await wait(0);
      expect(load).toHaveBeenCalledTimes(1);
      await wait(1_499);
      expect(load).toHaveBeenCalledTimes(1);
      await wait(1);
      expect(load).toHaveBeenCalledTimes(2);
      await wait(2_999);
      expect(load).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Live session ended")).toBeInTheDocument();
      await wait(1);
      expect(load).toHaveBeenCalledTimes(3);
      expect(screen.getByRole("heading", { name: "Top 5" })).toBeInTheDocument();
    });

    it("gives up after two retries and keeps the summary", async () => {
      vi.useFakeTimers();
      const load = vi.fn<PodiumLoader>(async () => PODIUM_LATER);
      render(
        <StageEndedLive sessionId={SESSION} title="T" summary={SUMMARY} rate={null} load={load} />,
      );
      await wait(60_000);
      expect(load).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
      expect(screen.getByText("Live session ended")).toBeInTheDocument();
    });

    it("does not ask again on no podium", async () => {
      vi.useFakeTimers();
      const load = vi.fn<PodiumLoader>(async () => null);
      render(
        <StageEndedLive sessionId={SESSION} title="T" summary={SUMMARY} rate={null} load={load} />,
      );
      await wait(60_000);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("stops asking and aborts when the stage goes away", async () => {
      vi.useFakeTimers();
      const signals: AbortSignal[] = [];
      const load = vi.fn<PodiumLoader>(async (_id, signal) => {
        signals.push(signal);
        return PODIUM_LATER;
      });
      const { unmount } = render(
        <StageEndedLive sessionId={SESSION} title="T" summary={SUMMARY} rate={null} load={load} />,
      );
      await wait(0);
      unmount();
      expect(signals[0]?.aborted).toBe(true);
      await wait(60_000);
      expect(load).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
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

  it("reads a refusal or a strange body as no podium", async () => {
    for (const status of [401, 403, 404]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ error: "no" }, { status })),
      );
      expect(await loadPodium(SESSION, signal)).toBeNull();
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200 })),
    );
    expect(await loadPodium(SESSION, signal)).toBeNull();
  });

  it("reads not ended yet, a server failure or a network failure as later", async () => {
    for (const status of [409, 500, 503]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ error: "not yet" }, { status })),
      );
      expect(await loadPodium(SESSION, signal)).toBe(PODIUM_LATER);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    expect(await loadPodium(SESSION, signal)).toBe(PODIUM_LATER);
  });

  it("reads an aborted request as no podium, not later", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError"))),
    );
    expect(await loadPodium(SESSION, controller.signal)).toBeNull();
  });
});
