import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
const browser = vi.hoisted(() => ({
  startAuthentication: vi.fn(async () => ({ id: "cred" })),
  startRegistration: vi.fn(async () => ({ id: "cred" })),
}));
vi.mock("@simplewebauthn/browser", () => browser);

import { DeviceGatePanel } from "./DeviceGatePanel";

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  replace.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeviceGatePanel", () => {
  it("unlocks with the passkey and goes where the person was headed", async () => {
    fetchMock
      .mockReturnValueOnce(reply(200, { options: { challenge: "c" } }))
      .mockReturnValueOnce(reply(200, { ok: true }));
    render(<DeviceGatePanel next="/author" invite={null} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Unlock with passkey" }));

    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/device-gate/unlock/verify");
    expect(replace).toHaveBeenCalledWith("/author");
  });

  it("says why when the passkey is not registered", async () => {
    fetchMock
      .mockReturnValueOnce(reply(200, { options: {} }))
      .mockReturnValueOnce(reply(403, { error: "unknown" }));
    render(<DeviceGatePanel next="/" invite={null} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Unlock with passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not registered");
    expect(replace).not.toHaveBeenCalled();
  });

  it("says nothing when the person closes the passkey prompt", async () => {
    fetchMock.mockReturnValueOnce(reply(200, { options: {} }));
    const cancelled = Object.assign(new Error("closed"), { name: "NotAllowedError" });
    browser.startAuthentication.mockRejectedValueOnce(cancelled);
    render(<DeviceGatePanel next="/" invite={null} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Unlock with passkey" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("adds a device with the enrollment code", async () => {
    fetchMock
      .mockReturnValueOnce(reply(200, { options: { challenge: "r" } }))
      .mockReturnValueOnce(reply(200, { ok: true }));
    render(<DeviceGatePanel next="/learn" invite={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add this device" }));
    await user.type(screen.getByLabelText("Device name"), "Laptop");
    await user.type(screen.getByLabelText("Enrollment code"), "secret-code");
    await user.click(screen.getByRole("button", { name: "Create passkey" }));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: "Laptop",
      code: "secret-code",
    });
    expect(replace).toHaveBeenCalledWith("/learn");
  });

  it("opens straight on adding the device from an invite link, with no code to type", async () => {
    fetchMock.mockReturnValueOnce(reply(403, { error: "invite" }));
    render(<DeviceGatePanel next="/" invite="tok" />);
    expect(screen.queryByLabelText("Enrollment code")).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Device name"), "Phone");
    await user.click(screen.getByRole("button", { name: "Create passkey" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Phone", invite: "tok" });
    expect(await screen.findByRole("alert")).toHaveTextContent("used or has expired");
  });
});
