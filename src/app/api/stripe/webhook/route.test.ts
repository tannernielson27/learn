import { describe, expect, it, vi } from "vitest";

const handleStripeWebhook = vi.fn(async () => new Response(null, { status: 204 }));
vi.mock("@/lib/billing/webhook", () => ({
  handleStripeWebhook: (...args: unknown[]) => handleStripeWebhook(...(args as [])),
}));
vi.mock("@/lib/billing/webhookDeps", () => ({ stripeWebhookDeps: () => "deps" }));

const route = await import("./route");

describe("/api/stripe/webhook", () => {
  it("answers POST only", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });

  it("hands the untouched request to the handler with the real dependencies", async () => {
    const request = new Request("https://learn.example/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const response = await route.POST(request);
    expect(response.status).toBe(204);
    expect(handleStripeWebhook).toHaveBeenCalledWith(request, "deps");
    expect(request.bodyUsed).toBe(false);
  });
});
