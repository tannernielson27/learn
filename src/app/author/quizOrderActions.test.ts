import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUIZ_ORDER_ERRORS } from "@/lib/authoring/quizOrder";

/** #468: the Change order screen's save, over a faked author check and database call. */

const supabase = { name: "client" };
const requireAuthor = vi.fn(async (next: string) => ({ supabase, next }));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: (next: string) => requireAuthor(next),
}));

const saveQuizOrder = vi.fn();
vi.mock("@/lib/authoring/quizOrderData", () => ({
  saveQuizOrder: (...args: unknown[]) => saveQuizOrder(...args),
}));

const revalidated = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated(path) }));

const { saveQuizOrderAction } = await import("./quizOrderActions");

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const A = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const B = "1c8b3d2e-5f60-4b7c-9d8e-0f1a2b3c4d5e";
const IDLE = { status: "idle" } as const;

function form(ids: readonly string[]): FormData {
  const data = new FormData();
  for (const id of ids) data.append("entry", id);
  return data;
}

beforeEach(() => {
  requireAuthor.mockClear();
  saveQuizOrder.mockReset();
  revalidated.mockClear();
});

describe("saveQuizOrderAction", () => {
  it("saves the order as the signed-in teacher and refreshes the quiz", async () => {
    saveQuizOrder.mockResolvedValue({ ok: true });
    const state = await saveQuizOrderAction(BANK, IDLE, form([B, A]));
    expect(state).toEqual({ status: "done", message: "Order saved." });
    expect(requireAuthor).toHaveBeenCalledWith(`/author/banks/${BANK}/order`);
    expect(saveQuizOrder).toHaveBeenCalledWith(supabase, BANK, [B, A]);
    expect(revalidated).toHaveBeenCalledWith(`/author/banks/${BANK}`);
  });

  it("refuses a quiz id that is not one, before signing anyone in", async () => {
    const state = await saveQuizOrderAction("nope", IDLE, form([A]));
    expect(state).toEqual({ status: "error", error: QUIZ_ORDER_ERRORS.gone });
    expect(requireAuthor).not.toHaveBeenCalled();
  });

  it("refuses a form that does not hold an order", async () => {
    const state = await saveQuizOrderAction(BANK, IDLE, form([A, A]));
    expect(state).toEqual({ status: "error", error: QUIZ_ORDER_ERRORS.changed });
    expect(saveQuizOrder).not.toHaveBeenCalled();
  });

  it("passes on the database's refusal and refreshes nothing", async () => {
    saveQuizOrder.mockResolvedValue({ ok: false, error: QUIZ_ORDER_ERRORS.changed });
    const state = await saveQuizOrderAction(BANK, IDLE, form([A, B]));
    expect(state).toEqual({ status: "error", error: QUIZ_ORDER_ERRORS.changed });
    expect(revalidated).not.toHaveBeenCalled();
  });
});
