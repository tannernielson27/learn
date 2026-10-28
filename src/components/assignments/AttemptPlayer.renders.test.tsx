import { Profiler, type ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import type { AttemptItemPayload } from "@/lib/assignments/attemptView";
import type { SaveResult } from "@/lib/assignments/autosave";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { AttemptPlayer } from "./AttemptPlayer";

/**
 * How often an answer change draws the item and the page (perf audit #35). The item is counted
 * each time it renders, the page by its commits and by its step list, which is drawn whenever the
 * page's own render goes on to its children.
 */
const counts = vi.hoisted(() => ({ item: 0, nav: 0, commits: 0 }));

vi.mock("@/components/question/SetNav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/question/SetNav")>();
  return {
    ...actual,
    SetNav: (props: ComponentProps<typeof actual.SetNav>) => {
      counts.nav += 1;
      return actual.SetNav(props);
    },
  };
});

vi.mock("@/components/question/ItemPlayer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/question/ItemPlayer")>();
  return {
    ...actual,
    ItemPlayer: (props: ComponentProps<typeof actual.ItemPlayer>) => {
      counts.item += 1;
      return actual.ItemPlayer(props);
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const FIRST = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const SECOND = itemSchema.parse(FIXTURES.multiple_choice.edge) as Item;
const ATTEMPT = "00000000-0000-4000-8000-0000000208a1";
const ITEMS: AttemptItemPayload[] = [
  {
    itemId: "00000000-0000-4000-8000-0000000208f1",
    position: 1,
    item: toKeylessItem(FIRST),
    saved: null,
  },
  {
    itemId: "00000000-0000-4000-8000-0000000208f2",
    position: 2,
    item: toKeylessItem(SECOND),
    saved: null,
  },
];

function setup(save: () => Promise<SaveResult>) {
  const saving =
    vi.fn<(attemptId: string, itemId: string, response: AnyResponse) => Promise<SaveResult>>(save);
  render(
    <Profiler id="attempt" onRender={() => (counts.commits += 1)}>
      <AttemptPlayer
        attemptId={ATTEMPT}
        attemptNumber={1}
        items={ITEMS}
        submit={async () => undefined}
        save={saving}
      />
    </Profiler>,
  );
  return { save: saving, user: userEvent.setup() };
}

const status = () => screen.getByTestId("save-status");
const reset = () => {
  counts.item = 0;
  counts.nav = 0;
  counts.commits = 0;
};

describe("AttemptPlayer renders", () => {
  afterEach(reset);

  it("draws the item once per answer change, not again when it is saved", async () => {
    const view = setup(async () => ({ ok: true }));
    await renderersLoaded();
    reset();

    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    expect(status()).toHaveTextContent("Saving");
    expect(counts.item).toBe(1);
    await waitFor(() => expect(status()).toHaveTextContent("Saved"), { timeout: 3000 });

    // The status line changed, so the page drew again; the item, which did not change, did not.
    expect(counts.commits).toBe(2);
    expect(counts.nav).toBe(2);
    expect(counts.item).toBe(1);
  });

  it("still draws the item for each new answer and each step moved to", async () => {
    const view = setup(async () => ({ ok: true }));
    await renderersLoaded();
    reset();

    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await view.user.click(screen.getByRole("radio", { name: /Document the weight/ }));
    expect(counts.item).toBe(2);
    expect(screen.getByRole("radio", { name: /Document the weight/ })).toBeChecked();

    await view.user.click(screen.getByRole("button", { name: "Next" }));
    await renderersLoaded();
    expect(counts.item).toBeGreaterThan(2);
    expect(screen.getByRole("button", { name: "Question 2, not answered" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("does not draw the page again when a retry fails the same way", async () => {
    const view = setup(async () => ({ ok: false, refusal: "failed", final: false }));
    await renderersLoaded();
    await view.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await waitFor(() => expect(status()).toHaveTextContent("Not saved, retrying"), {
      timeout: 3000,
    });
    reset();

    // The first retry goes out 2 s after the first failure, and fails too.
    await waitFor(() => expect(view.save).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(status()).toHaveTextContent("Not saved, retrying");
    expect(counts.nav).toBe(0);
  });
});
