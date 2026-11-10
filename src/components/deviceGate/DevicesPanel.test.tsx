import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { DevicesPanel } from "./DevicesPanel";
import { gateErrorMessage } from "./gateApi";

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const LIST = {
  current: "d1",
  devices: [
    {
      id: "d1",
      name: "Laptop",
      createdAt: "2026-11-10T16:00:00Z",
      lastUsedAt: null,
      revokedAt: null,
    },
    {
      id: "d2",
      name: "Phone",
      createdAt: "2026-11-10T17:00:00Z",
      lastUsedAt: null,
      revokedAt: null,
    },
    {
      id: "d3",
      name: "Old",
      createdAt: "2026-11-01T17:00:00Z",
      lastUsedAt: null,
      revokedAt: "2026-11-02T17:00:00Z",
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  replace.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DevicesPanel", () => {
  it("lists the devices and marks this one", async () => {
    fetchMock.mockReturnValueOnce(reply(200, LIST));
    render(<DevicesPanel />);
    expect(await screen.findByText("Laptop (this device)")).toBeInTheDocument();
    expect(screen.getByText(/^Revoked /)).toBeInTheDocument();
  });

  it("makes an invite link", async () => {
    fetchMock
      .mockReturnValueOnce(reply(200, LIST))
      .mockReturnValueOnce(
        reply(200, { link: "https://staging/x?invite=t", expiresAt: "2026-11-11T16:00:00Z" }),
      );
    render(<DevicesPanel />);
    await screen.findByText("Laptop (this device)");
    await userEvent.setup().click(screen.getByRole("button", { name: "Make an invite link" }));
    expect(await screen.findByText("https://staging/x?invite=t")).toBeInTheDocument();
  });

  it("revokes another device after a second press, and reloads the list", async () => {
    fetchMock
      .mockReturnValueOnce(reply(200, LIST))
      .mockReturnValueOnce(reply(200, { revoked: true }))
      .mockReturnValueOnce(reply(200, LIST));
    render(<DevicesPanel />);
    await screen.findByText("Phone");
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Revoke" })[1]);
    await user.click(screen.getByRole("button", { name: "Revoke Phone" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "revoke", id: "d2" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(replace).not.toHaveBeenCalled();
  });

  it("locks this device and goes back to the gate", async () => {
    fetchMock.mockReturnValueOnce(reply(200, LIST)).mockReturnValueOnce(reply(200, { ok: true }));
    render(<DevicesPanel />);
    await screen.findByText("Laptop (this device)");
    await userEvent.setup().click(screen.getByRole("button", { name: "Lock this device" }));
    expect(replace).toHaveBeenCalledWith("/device-gate");
  });

  it("says so when the list cannot be read", async () => {
    fetchMock.mockReturnValueOnce(reply(503, { error: "unavailable" }));
    render(<DevicesPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(gateErrorMessage("unavailable"));
  });
});
