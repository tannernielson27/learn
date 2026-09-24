import { describe, expect, it, vi } from "vitest";

const handleReminderCron = vi.fn(async () => new Response(null, { status: 204 }));
vi.mock("@/lib/reminders/cronRoute", () => ({
  handleReminderCron: (...args: unknown[]) => handleReminderCron(...(args as [])),
}));
vi.mock("@/lib/reminders/cronDeps", () => ({ reminderCronDeps: () => "deps" }));

const route = await import("./route");

describe("/api/cron/assignment-reminders", () => {
  it("answers POST only, so no GET, prefetch or crawler can start a run", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "maxDuration"]);
  });

  it("hands the request to the handler with the real dependencies", async () => {
    const request = new Request("https://learn.example/api/cron/assignment-reminders", {
      method: "POST",
    });
    const response = await route.POST(request);
    expect(response.status).toBe(204);
    expect(handleReminderCron).toHaveBeenCalledWith(request, "deps");
  });
});
