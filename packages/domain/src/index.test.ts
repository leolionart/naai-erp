import { describe, expect, it } from "vitest";

import { DOMAIN_PACKAGE } from "./index.js";

describe("domain package", () => {
  it("exposes a stable package identity", () => {
    expect(DOMAIN_PACKAGE).toBe("@naai-erp/domain");
  });
});
