import { describe, expect, it } from "vitest";
import { controlPath, liveViewOf, printedJoinUrl, projectorPath } from "./liveView";

const ID = "00000000-0000-4000-8000-0000000132aa";

describe("liveViewOf", () => {
  it("opens the projector view only for ?view=projector", () => {
    expect(liveViewOf("projector")).toBe("projector");
    expect(liveViewOf(["projector", "x"])).toBe("projector");
  });

  it("opens the control view for anything else", () => {
    expect(liveViewOf(undefined)).toBe("control");
    expect(liveViewOf("stage")).toBe("control");
    expect(liveViewOf([])).toBe("control");
  });
});

describe("the two addresses", () => {
  it("are one route with and without the view switch", () => {
    expect(projectorPath(ID)).toBe(`/live/${ID}?view=projector`);
    expect(controlPath(ID)).toBe(`/live/${ID}`);
  });
});

describe("printedJoinUrl", () => {
  it("prints where to go without the scheme or the code: a room types the code itself", () => {
    expect(printedJoinUrl("https://learn-nclex.app/join/V96RN8")).toBe("learn-nclex.app/join");
    expect(printedJoinUrl("http://localhost:3000/join/V96RN8")).toBe("localhost:3000/join");
  });

  it("falls back to the path alone for an address it cannot read", () => {
    expect(printedJoinUrl("not a url")).toBe("/join");
  });
});
