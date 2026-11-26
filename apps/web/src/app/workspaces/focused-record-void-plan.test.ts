import { describe, expect, it } from "vitest";
import { voidPlan } from "./focused-record-void-plan";

describe("voidPlan", () => {
  it("deletes drafts and cancels unposted workflow documents", () => {
    expect(voidPlan("documents", { state: "draft" })?.kind).toBe("delete");
    expect(voidPlan("documents", { state: "validated" })?.kind).toBe("cancel");
    expect(voidPlan("expenses", { state: "draft" })).toMatchObject({
      kind: "delete",
      method: "DELETE",
    });
  });

  it("voids issued/posted records through a reversing journal", () => {
    expect(voidPlan("documents", { state: "issued", journalId: "j1" })).toMatchObject({
      kind: "reverse",
      suffix: "/reverse",
      versioned: true,
    });
    expect(voidPlan("expenses", { state: "posted", journal_id: "j2" })?.kind).toBe("reverse");
  });

  it("blocks paid documents and offers nothing for finished or unsupported states", () => {
    expect(voidPlan("documents", { state: "paid" })?.kind).toBe("blocked");
    expect(voidPlan("documents", { state: "cancelled" })).toBeUndefined();
    expect(voidPlan("expenses", { state: "reversed" })).toBeUndefined();
    expect(voidPlan("expenses", { state: "approved" })).toBeUndefined();
    expect(voidPlan("recognition", { state: "posted" })).toBeUndefined();
  });

  it("does not offer a plain cancel for a draft that already has a journal", () => {
    expect(voidPlan("documents", { state: "draft", journalId: "j" })).toBeUndefined();
  });
});
