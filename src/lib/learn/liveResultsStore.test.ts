import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { loadLiveResultPage } from "./liveResultPage";
import { liveResultsStore } from "./liveResultsStore";

/**
 * The service role client that reads items with their keys is built only once the student's own
 * result is found. A session still running, someone else's, one that does not exist, or a read
 * that failed never builds it.
 */

const readSetItems = vi.fn<(client: unknown, ids: readonly string[]) => Promise<never[]>>(
  async () => [],
);
vi.mock("@/lib/supabase/attempts", () => ({
  readSetItems: (client: unknown, ids: readonly string[]) => readSetItems(client, ids),
}));

type Client = SupabaseClient<Database>;
const SESSION = "00000000-0000-4000-8000-0000000490a1";
const ITEM = "00000000-0000-4000-8000-000000000001";

function userAnswering(reply: { data: unknown; error: unknown }): Client {
  return { rpc: vi.fn(async () => reply) } as unknown as Client;
}

const serviceClient = { role: "service" } as unknown as Client;
const service = vi.fn(() => serviceClient);

describe("liveResultsStore", () => {
  beforeEach(() => {
    service.mockClear();
    readSetItems.mockClear();
  });

  it("builds no service client when the result is not found", async () => {
    const user = userAnswering({ data: [], error: null });
    const view = await loadLiveResultPage(liveResultsStore(user, service), SESSION);
    expect(view).toEqual({ kind: "missing" });
    expect(service).not.toHaveBeenCalled();
    expect(readSetItems).not.toHaveBeenCalled();
  });

  it("builds no service client when the result read fails", async () => {
    const user = userAnswering({ data: null, error: { message: "down" } });
    const view = await loadLiveResultPage(liveResultsStore(user, service), SESSION);
    expect(view).toEqual({ kind: "failed" });
    expect(service).not.toHaveBeenCalled();
  });

  it("builds the service client only to read the items", async () => {
    const store = liveResultsStore(userAnswering({ data: [], error: null }), service);
    expect(service).not.toHaveBeenCalled();
    await store.items([ITEM]);
    expect(service).toHaveBeenCalledOnce();
    expect(readSetItems).toHaveBeenCalledWith(serviceClient, [ITEM]);
  });
});
