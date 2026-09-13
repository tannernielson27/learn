import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toOrderedResponseForm } from "@/lib/authoring/forms/orderedResponse";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { orderedResponseItemSchema } from "@/lib/ngn/schemas";
import { OrderedResponseEditor } from "./OrderedResponseEditor";

function setup() {
  render(
    <OrderedResponseEditor
      initialValues={toOrderedResponseForm(
        orderedResponseItemSchema.parse(FIXTURES.ordered_response.edge),
      )}
      onSaveDraft={vi.fn(async () => ({ ok: true }))}
      onPublish={vi.fn(async () => ({ ok: true }))}
    />,
  );
  return userEvent.setup();
}

describe("OrderedResponseEditor focus after a move", () => {
  it("keeps focus on the same direction's button while the step can move further", async () => {
    const user = setup();
    screen.getByRole("button", { name: "Move step 2 down" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move step 3 down" })).toHaveFocus(),
    );
  });

  it("moves focus to the other direction's button when the step reaches the top", async () => {
    const user = setup();
    screen.getByRole("button", { name: "Move step 2 up" }).focus();
    await user.keyboard("{Enter}");
    // "Move step 1 up" is disabled now, so focus goes to the step's still-usable button.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move step 1 down" })).toHaveFocus(),
    );
  });

  it("moves focus to the other direction's button when the step reaches the bottom", async () => {
    const user = setup();
    screen.getByRole("button", { name: "Move step 3 down" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move step 4 up" })).toHaveFocus(),
    );
  });
});
