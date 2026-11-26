import { describe, expect, it } from "vitest";
import {
  columnStorageKey,
  hiddenIndexes,
  parseHiddenLabels,
  serializeHiddenLabels,
  toggleLabel,
} from "./table-columns";

const labels = ["Mã", "Ngày", "Tổng tiền"];

describe("table column visibility", () => {
  it("round-trips hidden labels and ignores corrupt storage", () => {
    const hidden = new Set(["Ngày"]);
    expect([...parseHiddenLabels(serializeHiddenLabels(hidden))]).toEqual(["Ngày"]);
    expect(parseHiddenLabels("not json").size).toBe(0);
    expect(parseHiddenLabels('[1,"",null,"Mã"]')).toEqual(new Set(["Mã"]));
    expect(parseHiddenLabels(null).size).toBe(0);
  });

  it("keeps the choice when columns are added, removed or reordered", () => {
    const hidden = new Set(["Tổng tiền"]);
    expect([...hiddenIndexes(labels, hidden)]).toEqual([2]);
    expect([...hiddenIndexes(["Tổng tiền", "Mã", "Dự án"], hidden)]).toEqual([0]);
    expect(hiddenIndexes(["Mã"], hidden).size).toBe(0);
  });

  it("never hides every column", () => {
    let hidden: ReadonlySet<string> = new Set();
    hidden = toggleLabel(labels, hidden, "Mã", false);
    hidden = toggleLabel(labels, hidden, "Ngày", false);
    expect([...hidden].sort()).toEqual(["Mã", "Ngày"]);
    expect(toggleLabel(labels, hidden, "Tổng tiền", false)).toBe(hidden);
    expect([...toggleLabel(labels, hidden, "Mã", true)]).toEqual(["Ngày"]);
  });

  it("is keyed by route only", () => {
    expect(columnStorageKey("/expenses")).toBe("naai-erp-table-columns-v2:/expenses");
  });
});
