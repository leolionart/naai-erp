import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planningActualBasis } from "./schema.js";

const migration = readFileSync(
  new URL("../../../db/migrations/0053_remove_planning_actual_fact_cache.sql", import.meta.url),
  "utf8",
);

describe("ERP-907 canonical planning actuals", () => {
  it("retains the shared actual basis enum without a persisted fact cache", () => {
    expect(planningActualBasis).toBeDefined();
  });

  it("drops only the obsolete persisted actual-fact cache", () => {
    expect(migration).toMatch(/DROP TABLE IF EXISTS planning_actual_facts/i);
    expect(migration).not.toMatch(/DROP TYPE|DELETE FROM|TRUNCATE/i);
  });
});
