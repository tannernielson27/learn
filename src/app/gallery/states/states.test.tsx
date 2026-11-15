import { existsSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatesGallery from "./page";
import { parseStateId, STATE_IDS, STATES } from "./states";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");

describe("the states gallery", () => {
  it("names a route file that exists for every state", () => {
    for (const id of STATE_IDS) expect(existsSync(path.join(ROOT, STATES[id].file)), id).toBe(true);
  });

  it("falls back to the first state for an unknown one", () => {
    expect(parseStateId("nope")).toBe(STATE_IDS[0]);
    expect(parseStateId(["error-room"])).toBe(STATE_IDS[0]);
    expect(parseStateId("error-room")).toBe("error-room");
  });

  it.each(STATE_IDS)("%s draws one h1 and no main of its own", async (state) => {
    const page = await StatesGallery({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ state }),
    } as PageProps<"/gallery/states">);
    const { container } = render(page);

    const demo = screen.getByTestId("states-demo");
    expect(demo).toHaveAttribute("data-state", state);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // The gallery's layout holds the page's one main.
    expect(container.querySelector("main")).toBeNull();
    if (state.startsWith("loading-")) expect(screen.getByRole("status")).toBeInTheDocument();
    if (state.startsWith("error-")) {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    }
    if (state.startsWith("not-found-")) {
      expect(screen.getByRole("heading", { name: "This page does not exist." })).toBeVisible();
    }
  });
});
