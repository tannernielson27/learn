import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { buildSampleSeedSql } from "./seed";

const SEED_PATH = path.resolve(import.meta.dirname, "../../../supabase/seed.sql");

describe("buildSampleSeedSql", () => {
  const sql = buildSampleSeedSql();

  it("seeds one sample bank with every canonical item type, the trend item and the case study", () => {
    expect(sql).toContain("'Samples'");
    for (const type of ITEM_TYPES) expect(sql).toContain(`'${type}'`);
    expect(sql.match(/insert into public\.case_study_items/g)).toHaveLength(1);
  });

  it("publishes the samples so they can be played", () => {
    expect(sql).not.toContain("'draft'");
  });

  it("never puts an answer key inside a content column", () => {
    for (const match of sql.matchAll(/-- content\n(\$json\$[\s\S]*?\$json\$)/g)) {
      expect(match[1]).not.toContain('"answerKey"');
    }
  });

  it("matches the committed supabase/seed.sql (set UPDATE_SEED=1 to regenerate)", () => {
    if (process.env.UPDATE_SEED === "1") writeFileSync(SEED_PATH, sql);
    expect(readFileSync(SEED_PATH, "utf8").replace(/\r\n/g, "\n")).toBe(sql);
  });
});
