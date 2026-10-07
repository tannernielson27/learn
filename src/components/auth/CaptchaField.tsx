"use client";

import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SCRIPT_URL } from "@/lib/auth/turnstile";

/** The part of Cloudflare's `window.turnstile` this component uses. */
interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/**
 * Adds Cloudflare's script to the page, once, the first time a field is drawn. No layout, and no
 * page without a `CaptchaField`, ever loads it. A load that fails is forgotten, so the next field
 * to mount tries again.
 */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_URL;
  script.async = true;
  const attempt = new Promise<TurnstileApi>((resolve, reject) => {
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("the CAPTCHA script loaded without its API"));
    });
    script.addEventListener("error", () => reject(new Error("the CAPTCHA script did not load")));
  })
    .finally(() => {
      // Settled either way: a later call reads `window.turnstile`, or starts again.
      loading = null;
    })
    .catch((error: unknown) => {
      script.remove();
      throw error;
    });
  loading = attempt;
  document.head.append(script);
  return attempt;
}

export interface CaptchaFieldProps {
  /** `captchaSiteKey()` from the server page. Null (the keys are unset) renders nothing. */
  siteKey: string | null;
  /** Names what the token is for; pass the same word to `verifyCaptcha`'s `action`. */
  action?: string;
  /**
   * Change it after every submit that comes back (a counter does). A token verifies once, so the
   * widget must issue another before the form can be sent again.
   */
  resetKey?: string | number;
}

const TROUBLE =
  "The check that you are a person could not load. Reload the page; if it still does not appear, allow challenges.cloudflare.com in your content blocker.";

/**
 * The Cloudflare Turnstile widget (#359). Put it inside the `<form>`: the widget adds a hidden
 * `cf-turnstile-response` input there, which `captchaTokenFrom(formData)` reads on the server.
 * The widget is Cloudflare's own frame: keyboard operable, and it follows the page's colour scheme.
 */
export function CaptchaField({ siteKey, action, resetKey }: CaptchaFieldProps) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const [trouble, setTrouble] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    let gone = false;
    loadTurnstile().then(
      (api) => {
        if (gone || !container.current) return;
        const id = api.render(container.current, {
          sitekey: siteKey,
          ...(action ? { action } : {}),
          theme: "auto",
          size: "flexible",
          callback: () => setTrouble(false),
          // Returning true tells the widget the page has shown the problem itself.
          "error-callback": () => {
            setTrouble(true);
            return true;
          },
        });
        if (typeof id === "string") widget.current = { api, id };
        else setTrouble(true);
      },
      () => {
        if (!gone) setTrouble(true);
      },
    );
    return () => {
      gone = true;
      const drawn = widget.current;
      widget.current = null;
      if (drawn) drawn.api.remove(drawn.id);
    };
  }, [siteKey, action]);

  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    const drawn = widget.current;
    if (drawn) drawn.api.reset(drawn.id);
  }, [resetKey]);

  if (!siteKey) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* The widget is 65px tall; holding the space keeps the form from jumping when it arrives. */}
      <div ref={container} data-testid="captcha-field" className="min-h-[65px]" />
      {trouble ? (
        <p role="alert" className="text-sm text-incorrect">
          {TROUBLE}
        </p>
      ) : null}
    </div>
  );
}
