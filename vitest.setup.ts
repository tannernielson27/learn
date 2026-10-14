import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Outside a Next build, `next/dynamic` resolves to the Pages Router loader, which renders its own
// placeholder without suspending and catches a failed load. Next aliases it to this module in the
// App Router (see createAppRouterApiAliases in next/dist/build/create-compiler-aliases.js):
// `React.lazy`, which suspends to the nearest Suspense boundary and throws a failed load to the
// nearest error boundary. The question renderers rely on both (#54), so tests use what the app ships.
vi.mock("next/dynamic", async () => {
  const appDynamic: { default?: unknown } = await import("next/dist/shared/lib/app-dynamic");
  return { default: appDynamic.default ?? appDynamic };
});

// jsdom has the <dialog> element but not its methods (#357). These stand in for the three things
// a browser does that `ui/Dialog` and its callers lean on: `showModal` opens, `close` closes and
// fires `close`, and Escape on the topmost open dialog fires a cancelable `cancel` and closes
// unless a listener prevents it. Top layer, inertness and focus are the browser's and are checked
// in e2e/dialog.spec.ts. Each stub steps aside if jsdom ever ships the real method.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      if (this.hasAttribute("open")) throw new DOMException("Already open", "InvalidStateError");
      this.setAttribute("open", "");
    };
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const top = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
      if (!top) return;
      if (top.dispatchEvent(new Event("cancel", { cancelable: true }))) top.close();
    });
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
