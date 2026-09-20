import { describe, expect, it } from "vitest";
import { JOIN_PATH, joinPath, joinUrl, playPath } from "./routes";

describe("joinPath", () => {
  it("puts the code in the path, normalized", () => {
    expect(joinPath("7KQ2MZ")).toBe("/join/7KQ2MZ");
    expect(joinPath("7kq 2mz")).toBe("/join/7KQ2MZ");
  });

  it("starts at the plain join page", () => {
    expect(joinPath("7KQ2MZ").startsWith(`${JOIN_PATH}/`)).toBe(true);
  });
});

describe("joinUrl", () => {
  it("is what the QR code carries: an absolute address on this site", () => {
    expect(joinUrl("https://learn.example", "7KQ2MZ")).toBe("https://learn.example/join/7KQ2MZ");
  });

  it("keeps a preview deployment's own host", () => {
    expect(joinUrl("https://learn-git-feat-129.vercel.app", "7kq2mz")).toBe(
      "https://learn-git-feat-129.vercel.app/join/7KQ2MZ",
    );
  });

  it("drops any path the origin came with, because the join page is at the root", () => {
    expect(joinUrl("http://localhost:3000/live/abc", "7KQ2MZ")).toBe(
      "http://localhost:3000/join/7KQ2MZ",
    );
  });
});

describe("playPath", () => {
  it("names the session by id, not by its reusable join code", () => {
    expect(playPath("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071")).toBe(
      "/play/3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071",
    );
  });
});
