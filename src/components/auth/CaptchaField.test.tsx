import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_SCRIPT_URL } from "@/lib/auth/turnstile";
import { CaptchaField } from "./CaptchaField";

type Options = Record<string, unknown>;

function stubTurnstile() {
  const api = {
    render: vi.fn<(container: HTMLElement, options: Options) => string>(() => "widget-1"),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return api;
}

const widgetScripts = () =>
  [...document.querySelectorAll<HTMLScriptElement>("script")].filter(
    (script) => script.src === TURNSTILE_SCRIPT_URL,
  );

afterEach(() => {
  delete window.turnstile;
  for (const script of widgetScripts()) script.remove();
});

describe("CaptchaField (#359)", () => {
  it("renders nothing, and loads nothing, without a site key", () => {
    const api = stubTurnstile();
    const { container } = render(<CaptchaField siteKey={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.render).not.toHaveBeenCalled();
    expect(widgetScripts()).toHaveLength(0);
  });

  it("draws the widget for the site key and the action", async () => {
    const api = stubTurnstile();
    render(<CaptchaField siteKey="0x4AAA-site" action="sign-up" />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    const [container, options] = api.render.mock.calls[0]!;
    expect(container).toBe(screen.getByTestId("captcha-field"));
    expect(options).toMatchObject({ sitekey: "0x4AAA-site", action: "sign-up" });
    expect(widgetScripts()).toHaveLength(0);
  });

  it("loads Cloudflare's script once, only when it is rendered, then draws", async () => {
    expect(widgetScripts()).toHaveLength(0);
    render(<CaptchaField siteKey="0x4AAA-site" />);
    render(<CaptchaField siteKey="0x4AAA-site" />);
    await waitFor(() => expect(widgetScripts()).toHaveLength(1));
    const api = stubTurnstile();
    act(() => {
      widgetScripts()[0]!.dispatchEvent(new Event("load"));
    });
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
  });

  it("says so when the script cannot load, and lets a later field try again", async () => {
    const first = render(<CaptchaField siteKey="0x4AAA-site" />);
    await waitFor(() => expect(widgetScripts()).toHaveLength(1));
    act(() => {
      widgetScripts()[0]!.dispatchEvent(new Event("error"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/);
    expect(widgetScripts()).toHaveLength(0);
    first.unmount();
    render(<CaptchaField siteKey="0x4AAA-site" />);
    await waitFor(() => expect(widgetScripts()).toHaveLength(1));
  });

  it("says so when the widget reports an error, and clears it once a token arrives", async () => {
    const api = stubTurnstile();
    render(<CaptchaField siteKey="0x4AAA-site" />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    const options = api.render.mock.calls[0]![1];
    let handled: unknown;
    act(() => {
      handled = (options["error-callback"] as (code: string) => unknown)("110200");
    });
    expect(handled).toBe(true);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    act(() => {
      (options.callback as (token: string) => void)("token-1");
    });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("asks for a fresh token when resetKey changes, since a token verifies once", async () => {
    const api = stubTurnstile();
    const { rerender } = render(<CaptchaField siteKey="0x4AAA-site" resetKey={0} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(api.reset).not.toHaveBeenCalled();
    rerender(<CaptchaField siteKey="0x4AAA-site" resetKey={1} />);
    await waitFor(() => expect(api.reset).toHaveBeenCalledWith("widget-1"));
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it("removes the widget when it unmounts", async () => {
    const api = stubTurnstile();
    const { unmount } = render(<CaptchaField siteKey="0x4AAA-site" />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    unmount();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });
});
