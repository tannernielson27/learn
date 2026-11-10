import { describe, expect, it, vi } from "vitest";
import { createGateStore } from "./store";

type Reply = { data: unknown; error: { message: string } | null };

function client(replies: Record<string, Reply>) {
  const rpc = vi.fn(async (name: string) => replies[name] ?? { data: null, error: null });
  return { rpc, store: createGateStore({ rpc } as never) };
}

describe("the gate store", () => {
  it("adds a device, passing the invite only when there is one", async () => {
    const { rpc, store } = client({ device_gate_add_device: { data: "dev-1", error: null } });
    const device = {
      name: "Laptop",
      credentialId: "cred",
      publicKey: "key",
      counter: 0,
      transports: ["internal"],
      inviteHash: null,
    };
    expect(await store.addDevice(device)).toEqual({ ok: true, id: "dev-1" });
    expect(rpc).toHaveBeenLastCalledWith("device_gate_add_device", {
      p_name: "Laptop",
      p_credential_id: "cred",
      p_public_key: "key",
      p_counter: 0,
      p_transports: ["internal"],
    });
    await store.addDevice({ ...device, inviteHash: "h" });
    expect(rpc).toHaveBeenLastCalledWith(
      "device_gate_add_device",
      expect.objectContaining({ p_invite_hash: "h" }),
    );
  });

  it("reports a used invite, and throws on any other error", async () => {
    const used = client({
      device_gate_add_device: { data: null, error: { message: "invite_invalid" } },
    });
    const device = {
      name: "P",
      credentialId: "c",
      publicKey: "k",
      counter: 0,
      transports: [],
      inviteHash: "h",
    };
    expect(await used.store.addDevice(device)).toEqual({ ok: false, reason: "invite_invalid" });

    const broken = client({ device_gate_add_device: { data: null, error: { message: "boom" } } });
    await expect(broken.store.addDevice(device)).rejects.toThrow("adding a device failed: boom");
  });

  it("reads a credential, or nothing", async () => {
    const { store } = client({
      device_gate_credential: {
        data: [{ device_id: "d", public_key: "k", counter: "5", transports: null }],
        error: null,
      },
    });
    expect(await store.credential("c")).toEqual({
      deviceId: "d",
      publicKey: "k",
      counter: 5,
      transports: [],
    });
    expect(
      await client({ device_gate_credential: { data: [], error: null } }).store.credential("c"),
    ).toBeNull();
  });

  it("answers the yes-or-no calls only with a real true", async () => {
    const { store } = client({
      device_gate_record_use: { data: true, error: null },
      device_gate_device_active: { data: false, error: null },
      device_gate_revoke_device: { data: true, error: null },
      device_gate_invite_open: { data: null, error: null },
    });
    expect(await store.recordUse("d", 1)).toBe(true);
    expect(await store.isDeviceActive("d")).toBe(false);
    expect(await store.revokeDevice("d")).toBe(true);
    expect(await store.isInviteOpen("h")).toBe(false);
  });

  it("lists devices and creates invites", async () => {
    const { store } = client({
      device_gate_list_devices: {
        data: [{ id: "d", name: "L", created_at: "c", last_used_at: null, revoked_at: "r" }],
        error: null,
      },
      device_gate_create_invite: { data: "2027-01-01", error: null },
    });
    expect(await store.listDevices()).toEqual([
      { id: "d", name: "L", createdAt: "c", lastUsedAt: null, revokedAt: "r" },
    ]);
    expect(await store.createInvite("h", "d", 60)).toBe("2027-01-01");
  });

  it("throws when the database fails, so nobody is let in by an error", async () => {
    const failing = { data: null, error: { message: "down" } };
    const { store } = client({
      device_gate_credential: failing,
      device_gate_record_use: failing,
      device_gate_device_active: failing,
      device_gate_list_devices: failing,
      device_gate_revoke_device: failing,
      device_gate_create_invite: failing,
      device_gate_invite_open: failing,
    });
    await expect(store.credential("c")).rejects.toThrow();
    await expect(store.recordUse("d", 1)).rejects.toThrow();
    await expect(store.isDeviceActive("d")).rejects.toThrow();
    await expect(store.listDevices()).rejects.toThrow();
    await expect(store.revokeDevice("d")).rejects.toThrow();
    await expect(store.createInvite("h", "d", 60)).rejects.toThrow();
    await expect(store.isInviteOpen("h")).rejects.toThrow();
  });
});
