import { describe, expect, it } from "vitest";
import { PROJECT_FREELANCE_PAYABLE_CONTRACT_VERSION } from "./project-freelance-payables.js";
describe("project freelance payable contract", () => {
  it("is v1", () => expect(PROJECT_FREELANCE_PAYABLE_CONTRACT_VERSION).toBe(1));
});
