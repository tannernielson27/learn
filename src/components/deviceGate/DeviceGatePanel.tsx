"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { gateErrorMessage, gateRequest, wasCancelled } from "./gateApi";

interface Props {
  /** Where to go once the device is in: a same-origin path, already checked. */
  readonly next: string;
  /** The token from an invite link, when the page was opened from one. */
  readonly invite: string | null;
}

/**
 * Unlock with this device's passkey, or add the device: with the enrollment code for the first
 * one, or with an invite link made on a device already in (ADR 0017).
 */
export function DeviceGatePanel({ next, invite }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"unlock" | "add">(invite ? "add" : "unlock");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(step: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const problem = await step();
      if (problem) setError(problem);
      // The proxy reads the new cookie on the next request, so a client navigation is enough.
      else router.replace(next);
    } catch (caught) {
      setError(wasCancelled(caught) ? null : gateErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  const unlock = () =>
    run(async () => {
      const options = await gateRequest("/api/device-gate/unlock/options");
      if (options.status !== 200) return gateErrorMessage(options.data.error);
      const response = await startAuthentication({ optionsJSON: options.data.options as never });
      const verified = await gateRequest("/api/device-gate/unlock/verify", { body: { response } });
      return verified.status === 200 ? null : gateErrorMessage(verified.data.error);
    });

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const code = String(form.get("code") ?? "");
    return run(async () => {
      const options = await gateRequest("/api/device-gate/register/options", {
        body: invite ? { name, invite } : { name, code },
      });
      if (options.status !== 200) return gateErrorMessage(options.data.error);
      const response = await startRegistration({ optionsJSON: options.data.options as never });
      const verified = await gateRequest("/api/device-gate/register/verify", {
        body: { response },
      });
      return verified.status === 200 ? null : gateErrorMessage(verified.data.error);
    });
  };

  return (
    <div className="grid gap-6">
      {error ? (
        <Notice role="alert" title="Not yet">
          {error}
        </Notice>
      ) : null}

      {mode === "unlock" ? (
        <div className="grid gap-4">
          <Button variant="primary" size="lg" block disabled={busy} onClick={unlock}>
            Unlock with passkey
          </Button>
          <Button variant="ghost" block disabled={busy} onClick={() => setMode("add")}>
            Add this device
          </Button>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={add}>
          <Field
            label="Device name"
            name="name"
            required
            maxLength={60}
            autoComplete="off"
            hint="So you can tell it apart later, like Work laptop."
          />
          {invite ? null : (
            <Field
              label="Enrollment code"
              name="code"
              type="password"
              required
              autoComplete="off"
            />
          )}
          <Button variant="primary" size="lg" block type="submit" disabled={busy}>
            Create passkey
          </Button>
          {invite ? null : (
            <Button variant="ghost" block disabled={busy} onClick={() => setMode("unlock")}>
              This device already has a passkey
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
