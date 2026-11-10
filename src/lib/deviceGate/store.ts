import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * The device gate's rows, read and written only through the device_gate_* functions
 * (supabase/migrations/20261110000000_device_gate.sql), which only the service role may call.
 * Every failure throws, so a caller that cannot reach the database refuses rather than lets in.
 */

export interface StoredCredential {
  readonly deviceId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
}

export interface DeviceSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

export interface NewDevice {
  readonly name: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
  /** The sha-256 of the invite token, when the device came in through an invite link. */
  readonly inviteHash: string | null;
}

export interface GateStore {
  addDevice(
    device: NewDevice,
  ): Promise<{ ok: true; id: string } | { ok: false; reason: "invite_invalid" }>;
  credential(credentialId: string): Promise<StoredCredential | null>;
  recordUse(deviceId: string, counter: number): Promise<boolean>;
  isDeviceActive(deviceId: string): Promise<boolean>;
  listDevices(): Promise<readonly DeviceSummary[]>;
  revokeDevice(deviceId: string): Promise<boolean>;
  createInvite(tokenHash: string, createdBy: string, ttlSeconds: number): Promise<string>;
  isInviteOpen(tokenHash: string): Promise<boolean>;
}

type Client = SupabaseClient<Database>;

function fail(what: string, error: { message: string }): never {
  throw new Error(`device gate: ${what} failed: ${error.message}`);
}

export function createGateStore(client: Client = createSupabaseServiceClient()): GateStore {
  return {
    async addDevice(device) {
      const { data, error } = await client.rpc("device_gate_add_device", {
        p_name: device.name,
        p_credential_id: device.credentialId,
        p_public_key: device.publicKey,
        p_counter: device.counter,
        p_transports: [...device.transports],
        ...(device.inviteHash ? { p_invite_hash: device.inviteHash } : {}),
      });
      if (error) {
        if (error.message.includes("invite_invalid"))
          return { ok: false, reason: "invite_invalid" };
        fail("adding a device", error);
      }
      return { ok: true, id: data };
    },

    async credential(credentialId) {
      const { data, error } = await client.rpc("device_gate_credential", {
        p_credential_id: credentialId,
      });
      if (error) fail("reading a credential", error);
      const row = data?.[0];
      if (!row) return null;
      return {
        deviceId: row.device_id,
        publicKey: row.public_key,
        counter: Number(row.counter),
        transports: row.transports ?? [],
      };
    },

    async recordUse(deviceId, counter) {
      const { data, error } = await client.rpc("device_gate_record_use", {
        p_device_id: deviceId,
        p_counter: counter,
      });
      if (error) fail("recording a use", error);
      return data === true;
    },

    async isDeviceActive(deviceId) {
      const { data, error } = await client.rpc("device_gate_device_active", {
        p_device_id: deviceId,
      });
      if (error) fail("checking a device", error);
      return data === true;
    },

    async listDevices() {
      const { data, error } = await client.rpc("device_gate_list_devices");
      if (error) fail("listing devices", error);
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at ?? null,
        revokedAt: row.revoked_at ?? null,
      }));
    },

    async revokeDevice(deviceId) {
      const { data, error } = await client.rpc("device_gate_revoke_device", {
        p_device_id: deviceId,
      });
      if (error) fail("revoking a device", error);
      return data === true;
    },

    async createInvite(tokenHash, createdBy, ttlSeconds) {
      const { data, error } = await client.rpc("device_gate_create_invite", {
        p_token_hash: tokenHash,
        p_created_by: createdBy,
        p_ttl_seconds: ttlSeconds,
      });
      if (error) fail("creating an invite", error);
      return data;
    },

    async isInviteOpen(tokenHash) {
      const { data, error } = await client.rpc("device_gate_invite_open", {
        p_token_hash: tokenHash,
      });
      if (error) fail("checking an invite", error);
      return data === true;
    },
  };
}
