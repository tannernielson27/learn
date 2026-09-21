// #54: the gallery nav is in the layout, so whatever it imports ships on every gallery page. It
// once imported the renderer registry just to ask which types were built, and so every gallery
// route carried all fourteen renderers and dnd-kit. It reads a plain list of types instead.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "@/components/testing/importGraph";

const NAV = path.join(SRC, "app", "gallery", "nav.tsx");
const QUESTION = path.join(SRC, "components", "question");
const REGISTRY = path.join(QUESTION, "registry.ts");

describe("the gallery nav", () => {
  const files = reachable(NAV);
  const packages = new Set(packagesIn(files).map(({ specifier }) => specifier));

  it("does not reach the renderer registry", () => {
    expect(files.has(REGISTRY) ? shortest(files.get(REGISTRY)!) : null).toBeNull();
  });

  it("does not reach any renderer or the player", () => {
    const offenders = [...files.entries()]
      .filter(([file]) => file.startsWith(QUESTION + path.sep) && file.endsWith(".tsx"))
      .map(([, chain]) => shortest(chain));
    expect(offenders).toEqual([]);
  });

  it("does not pull in dnd-kit", () => {
    expect([...packages].filter((name) => name.startsWith("@dnd-kit/"))).toEqual([]);
  });

  it("would notice the registry coming back", () => {
    // The playground renders items, so it is the proof that the walk finds the registry.
    const playground = path.join(SRC, "app", "gallery", "items", "[type]", "playground.tsx");
    const reached = reachable(playground);
    expect(reached.has(REGISTRY)).toBe(true);
    expect(packagesIn(reached).some(({ specifier }) => specifier === "@dnd-kit/core")).toBe(true);
  });
});
