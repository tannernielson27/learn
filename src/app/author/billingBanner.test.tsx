import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #522: the billing banner in the author layout, over a faked Supabase client, and its absence
 * from every student frame. What is pinned: a teacher sees the one banner their workspace's state
 * calls for; nothing is read or drawn without Stripe set up, for a student, or for a visitor; the
 * grant history is read only for a workspace with no access; and the student layout never draws a
 * banner, nor does any student, live, join or practice route import one.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/author",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("./actions", () => ({ signOut: vi.fn(async () => undefined) }));

const USER = "00000000-0000-4000-8000-0000000000a1";
const ORG = "00000000-0000-4000-8000-000000000001";

type Reply = { data?: unknown; error?: { code?: string } | null };
let role: string | null;
let signedIn: boolean;
let billing: Reply;
let grants: Reply;

function builderFor(table: string) {
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "eq", "limit"]) builder[step] = () => builder;
  builder.maybeSingle = async () =>
    table === "profiles"
      ? { data: { org_id: ORG, role, display_name: "Ada Lovelace" }, error: null }
      : { data: null, error: null };
  builder.then = (resolve: (value: Reply) => unknown) =>
    resolve(table === "access_grants" ? grants : { data: [], error: null });
  return builder;
}

const client = {
  auth: {
    getClaims: async () => ({
      data: signedIn ? { claims: { sub: USER, email: "ada@school.edu" } } : null,
    }),
  },
  from: vi.fn((table: string) => builderFor(table)),
  rpc: vi.fn(async (name: string) =>
    name === "workspace_access" ? billing : { data: null, error: null },
  ),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));

const { default: AuthorLayout } = await import("./layout");
const { default: StudentLayout } = await import("../learn/layout");

function row(overrides: Record<string, unknown> = {}): Reply {
  return {
    data: [
      {
        has_access: true,
        source: "subscription",
        grant_kind: null,
        status: "trialing",
        trial_end: "2026-11-05T17:00:00Z",
        current_period_end: "2026-11-05T17:00:00Z",
        cancel_at_period_end: false,
        is_founder: true,
        ...overrides,
      },
    ],
    error: null,
  };
}

function withStripe() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake");
}

type Layout = (props: { children: ReactElement; params: Promise<object> }) => Promise<ReactElement>;

async function draw(layout: Layout) {
  return render(await layout({ children: <p>Page</p>, params: Promise.resolve({}) }));
}

const banner = () => screen.queryByRole("region", { name: "Billing notice" });
const rpcNames = () => client.rpc.mock.calls.map(([name]) => name);
const tablesRead = () => client.from.mock.calls.map(([table]) => table);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T17:00:00Z"));
  role = "instructor";
  signedIn = true;
  billing = row();
  grants = { data: [], error: null };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the author layout's billing banner (#522)", () => {
  it("tells the person who started the workspace that the trial ends soon", async () => {
    withStripe();
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toHaveTextContent("Your free trial ends on 5 November 2026.");
    expect(screen.getByRole("link", { name: "Manage billing" })).toHaveAttribute(
      "href",
      "/author/workspace#billing-heading",
    );
    expect(rpcNames()).toEqual(["workspace_access"]);
    expect(tablesRead()).not.toContain("access_grants");
  });

  it("tells another teacher who manages billing when a payment did not go through", async () => {
    withStripe();
    billing = row({ status: "past_due", is_founder: false });
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toHaveTextContent("Your last payment did not go through.");
    expect(banner()).toHaveTextContent("The person who started your workspace manages billing.");
    expect(screen.queryByRole("link", { name: "Manage billing" })).toBeNull();
  });

  it("says free access has ended only when the workspace once had it", async () => {
    withStripe();
    billing = row({ has_access: false, source: "none", status: null });
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    expect(tablesRead()).toContain("access_grants");
    cleanup();

    grants = { data: [{ kind: "beta" }], error: null };
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toHaveTextContent("Your free access has ended.");
    expect(screen.getByRole("link", { name: "Start a free trial or subscribe" })).toBeVisible();
  });

  it("says nothing when the grant history cannot be read", async () => {
    withStripe();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    billing = row({ has_access: false, source: "none", status: null });
    grants = { data: null, error: { code: "42501" } };
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("says nothing for free access, and reads nothing more", async () => {
    withStripe();
    billing = row({ source: "grant", grant_kind: "grandfathered", status: null });
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    expect(tablesRead()).not.toContain("access_grants");
  });

  it("reads and draws nothing without Stripe set up here", async () => {
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    expect(rpcNames()).not.toContain("workspace_access");
  });

  it("reads and draws nothing for an account that is not a teacher, or a visitor", async () => {
    withStripe();
    role = null;
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    cleanup();
    signedIn = false;
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    expect(rpcNames()).not.toContain("workspace_access");
  });

  it("says nothing when workspace_access() fails", async () => {
    withStripe();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    billing = { data: null, error: { code: "PGRST202" } };
    await draw(AuthorLayout as unknown as Layout);
    expect(banner()).toBeNull();
    logged.mockRestore();
  });
});

describe("students never see a billing banner", () => {
  it("the student layout draws none and reads no billing state, whatever the workspace", async () => {
    withStripe();
    role = "student";
    billing = row({ status: "past_due" });
    await draw(StudentLayout as unknown as Layout);
    expect(screen.getByText("Page")).toBeVisible();
    expect(banner()).toBeNull();
    expect(screen.queryByText(/payment|trial|subscription|free access/i)).toBeNull();
    expect(rpcNames()).not.toContain("workspace_access");
  });

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  // Student pages (/learn, its practice and live screens), joining (/join, /c, /play, /live) and
  // shared practice: none may reach the banner or the request's billing read.
  it.each(["learn", "join", "c", "play", "live"])("nothing under src/app/%s imports it", (dir) => {
    for (const path of files(join(process.cwd(), "src/app", dir))) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /components\/billing|billing\/(banner|requestAccess)/,
      );
    }
  });
});
