"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { gateErrorMessage, gateRequest, type GateReply } from "./gateApi";

interface Device {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

const DATE = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Denver",
});

function when(value: string | null): string {
  return value ? DATE.format(new Date(value)) : "never";
}

/** Lists the devices that can open staging, makes invite links, and revokes (ADR 0017). */
export function DevicesPanel() {
  const [devices, setDevices] = useState<readonly Device[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; expiresAt: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const show = useCallback((reply: GateReply) => {
    if (reply.status !== 200) {
      setError(gateErrorMessage(reply.data.error));
      return;
    }
    setDevices(reply.data.devices as Device[]);
    setCurrent(typeof reply.data.current === "string" ? reply.data.current : null);
  }, []);

  const load = useCallback(
    () => gateRequest("/api/device-gate/devices", { method: "GET" }).then(show),
    [show],
  );

  useEffect(() => {
    let live = true;
    void gateRequest("/api/device-gate/devices", { method: "GET" }).then((reply) => {
      if (live) show(reply);
    });
    return () => {
      live = false;
    };
  }, [show]);

  async function act(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setError(null);
    const reply = await gateRequest("/api/device-gate/devices", { body });
    if (reply.status !== 200) {
      setError(gateErrorMessage(reply.data.error));
      return null;
    }
    return reply.data;
  }

  async function makeInvite() {
    const data = await act({ action: "invite" });
    if (data) setInvite({ link: String(data.link), expiresAt: String(data.expiresAt) });
  }

  async function revoke(id: string) {
    setConfirming(null);
    if (!(await act({ action: "revoke", id }))) return;
    if (id === current) router.replace("/device-gate");
    else await load();
  }

  async function lock() {
    if (await act({ action: "lock" })) router.replace("/device-gate");
  }

  return (
    <div className="grid gap-6">
      {error ? <Notice role="alert">{error}</Notice> : null}

      <section aria-labelledby="add-device" className="grid gap-3">
        <h2 id="add-device" className="font-semibold text-ink-1">
          Add another device
        </h2>
        <p className="text-ink-2">
          An invite link adds one device and works for 24 hours. Open it on the new device.
        </p>
        <Button variant="primary" onClick={makeInvite}>
          Make an invite link
        </Button>
        {invite ? (
          <div className="grid gap-2 rounded-md border border-line p-3">
            <p className="break-all font-mono text-sm text-ink-1">{invite.link}</p>
            <p className="text-sm text-ink-2">Works until {when(invite.expiresAt)}.</p>
            <Button size="sm" onClick={() => void navigator.clipboard?.writeText(invite.link)}>
              Copy link
            </Button>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="device-list" className="grid gap-3">
        <h2 id="device-list" className="font-semibold text-ink-1">
          Devices
        </h2>
        {devices === null ? (
          <p className="text-ink-2">Loading</p>
        ) : (
          <ul className="grid gap-3">
            {devices.map((device) => (
              <li key={device.id} className="grid gap-1 rounded-md border border-line p-3">
                <p className="font-semibold text-ink-1">
                  {device.name}
                  {device.id === current ? " (this device)" : ""}
                </p>
                <p className="text-sm text-ink-2">
                  Added {when(device.createdAt)}. Last used {when(device.lastUsedAt)}.
                </p>
                {device.revokedAt ? (
                  <p className="text-sm text-ink-2">Revoked {when(device.revokedAt)}.</p>
                ) : confirming === device.id ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => void revoke(device.id)}>
                      Revoke {device.name}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button size="sm" onClick={() => setConfirming(device.id)}>
                      Revoke
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button variant="ghost" onClick={lock}>
        Lock this device
      </Button>
    </div>
  );
}
