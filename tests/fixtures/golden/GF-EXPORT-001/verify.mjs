import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const text = (name) => readFileSync(join(root, name), "utf8").replaceAll("\r\n", "\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`;
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const input = JSON.parse(text("input.json"));
assert(input.fixtureId === "GF-EXPORT-001", "fixture identity mismatch");
const requestHash = hash(input.request),
  resultHash = hash(input.result),
  changedResultHash = hash(input.changedResult);
const snapshotRows = text("expected-snapshots.csv").trim().split("\n");
const actualSnapshot = `${input.snapshotId},${input.snapshotVersion},${input.reportKind},final,${requestHash},${resultHash},${input.ledgerCutoff.sourceFingerprint}`;
assert(snapshotRows[1] === actualSnapshot, "snapshot oracle differs");
assert(
  input.mappings.every((mapping) => mapping.status === "mapped"),
  "final snapshot contains incomplete mappings",
);
assert(resultHash !== changedResultHash, "changed result did not change hash");
const workbook =
  ["Label,Amount minor,Mapping status", ...input.workbook.rows.map((row) => row.join(","))].join(
    "\n",
  ) + "\n";
assert(text("expected-workbook.csv") === workbook, "workbook rows differ");
const reproduction = text("expected-reproduction.csv").trim().split("\n").slice(1);
assert(reproduction[0] === "identical,true,true,true", "identical reproduction oracle differs");
assert(
  reproduction[1] === "changed_result,true,false,false",
  "changed reproduction oracle differs",
);
console.log("GF-EXPORT-001: canonical hashes, readiness, workbook and reproduction verified");
