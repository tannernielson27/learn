import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  readTheme,
  serverTheme,
  subscribeTheme,
} from "./themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system, on the server and with nothing stored", () => {
    expect(serverTheme()).toBe("system");
    expect(readTheme()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readTheme()).toBe("system");
  });

  it("stores light and dark, and stores nothing for system", () => {
    applyTheme("light");
    expect(readTheme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("reads as system when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTheme()).toBe("system");
  });

  it("tells subscribers about a change here and one from another tab, until they leave", () => {
    const heard = vi.fn();
    const leave = subscribeTheme(heard);
    applyTheme("dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    expect(heard).toHaveBeenCalledTimes(2);
    leave();
    applyTheme("light");
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("boots the stored theme before paint, and leaves system alone", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(THEME_STORAGE_KEY, "nonsense");
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
