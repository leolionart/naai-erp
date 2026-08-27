import { describe, expect, it } from "vitest";
import { sortRecordsNewestFirst } from "./focused-record-sorting";

describe("sortRecordsNewestFirst", () => {
  it("orders newest activity first and keeps undated records last", () => {
    const rows = sortRecordsNewestFirst(
      [
        { id: "old", date: "2025-01-01" },
        { id: "new", date: "2026-08-01" },
        { id: "undated", date: "" },
      ],
      (row) => String(row.date),
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "old", "undated"]);
  });
});
