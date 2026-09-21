import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lazy, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RENDERER_FAILED, withLoadRecovery } from "./RendererRecovery";

interface Props {
  item: { id: string; type: string };
}

const Loaded: ComponentType<Props> = ({ item }) => <p>Renderer for {item.id}</p>;

/** Stands in for a `next/dynamic` renderer whose chunk never arrives. */
const failedChunk = () =>
  lazy<ComponentType<Props>>(() => Promise.reject(new Error("Failed to load chunk /secret.js")));

function Page({ Renderer, id = "item-1" }: { Renderer: ComponentType<Props>; id?: string }) {
  return (
    <div>
      <p role="status">Connected to the session</p>
      <nav aria-label="Steps">
        <button type="button">Next step</button>
      </nav>
      <Renderer item={{ id, type: "multiple_choice" }} />
    </div>
  );
}

describe("withLoadRecovery", () => {
  beforeEach(() => {
    // React reports every caught render error; the boundary is doing its job here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a calm inline message, and no error details, when the renderer fails to load", async () => {
    const Renderer = withLoadRecovery(failedChunk(), vi.fn(), vi.fn());
    render(<Page Renderer={Renderer} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(RENDERER_FAILED);
    expect(alert).not.toHaveTextContent(/chunk|secret|Error/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps the rest of the page rendered around the failed question", async () => {
    const Renderer = withLoadRecovery(failedChunk(), vi.fn(), vi.fn());
    render(<Page Renderer={Renderer} />);

    await screen.findByRole("alert");
    expect(screen.getByRole("status")).toHaveTextContent("Connected to the session");
    expect(screen.getByRole("button", { name: "Next step" })).toBeInTheDocument();
  });

  it("loads the renderer again on Try again, and shows it when that attempt succeeds", async () => {
    const load = vi.fn().mockResolvedValue(Loaded);
    const reload = vi.fn();
    const Renderer = withLoadRecovery(failedChunk(), load, reload);
    render(<Page Renderer={Renderer} />);

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Renderer for item-1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("offers a reload only once a retry in place has failed too", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Failed to load chunk"));
    const reload = vi.fn();
    const Renderer = withLoadRecovery(failedChunk(), load, reload);
    render(<Page Renderer={Renderer} />);

    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Reload the page" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    // The retry failed as well. Try again still retries in place; a reload is the student's call.
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Reload the page" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("makes a fresh attempt when the item changes", async () => {
    const load = vi.fn().mockResolvedValue(Loaded);
    const Renderer = withLoadRecovery(failedChunk(), load, vi.fn());
    const { rerender } = render(<Page Renderer={Renderer} id="item-1" />);
    await screen.findByRole("alert");

    rerender(<Page Renderer={Renderer} id="item-2" />);

    expect(await screen.findByText("Renderer for item-2")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("gives a player mounted after a failure a real attempt, not the cached rejection", async () => {
    const load = vi.fn().mockResolvedValue(Loaded);
    const Renderer = withLoadRecovery(failedChunk(), load, vi.fn());
    const first = render(<Page Renderer={Renderer} />);
    await screen.findByRole("alert");
    first.unmount();

    // A case study remounts the player for each step.
    render(<Page Renderer={Renderer} id="item-2" />);

    expect(await screen.findByText("Renderer for item-2")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("renders the renderer untouched when its chunk loads", async () => {
    const load = vi.fn();
    const Renderer = withLoadRecovery(Loaded, load, vi.fn());
    render(<Page Renderer={Renderer} />);

    expect(await screen.findByText("Renderer for item-1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});
