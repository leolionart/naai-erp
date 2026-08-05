import { describe, expect, it } from "vitest";

import {
  createCalendarYearPeriods,
  createExchangeRate,
  createMembership,
  createOrganization,
  transitionFiscalPeriod,
} from "./organization-setup.js";

describe("ERP-100 organization and fiscal setup", () => {
  const organization = createOrganization({
    id: "org-naai",
    legalName: "NAAI Studio",
    baseCurrency: "vnd",
    timezone: "Asia/Ho_Chi_Minh",
  });

  it("creates an organization and scoped membership", () => {
    const membership = createMembership({
      organizationId: organization.id,
      userId: "user-owner",
      roles: ["owner", "owner"],
    });
    expect(organization.baseCurrency).toBe("VND");
    expect(membership).toEqual({
      organizationId: organization.id,
      userId: "user-owner",
      roles: ["owner"],
    });
    expect(() =>
      createMembership({ organizationId: "org-naai", userId: "x", roles: [] }),
    ).toThrow();
  });

  it("creates twelve contiguous calendar periods including leap day", () => {
    const periods = createCalendarYearPeriods(organization, 2028);
    expect(periods).toHaveLength(12);
    expect(periods[1]).toMatchObject({
      startsOn: "2028-02-01",
      endsOn: "2028-02-29",
      state: "open",
    });
    expect(periods[2]?.startsOn).toBe("2028-03-01");
  });

  it("allows only explicit fiscal period transitions", () => {
    const period = createCalendarYearPeriods(organization, 2026)[0]!;
    const locked = transitionFiscalPeriod(period, "hard_locked");
    expect(locked.state).toBe("hard_locked");
    expect(() => transitionFiscalPeriod(locked, "soft_locked")).toThrow(
      "Invalid fiscal period transition",
    );
    expect(transitionFiscalPeriod(locked, "open").state).toBe("open");
  });

  it("accepts exact exchange-rate strings and rejects unsafe values", () => {
    expect(
      createExchangeRate({
        organizationId: organization.id,
        sourceCurrency: "USD",
        targetCurrency: "VND",
        rate: "26125.500000",
        source: "Vietcombank",
        observedAt: "2026-08-05T09:00:00+07:00",
      }).rate,
    ).toBe("26125.500000");
    expect(() =>
      createExchangeRate({
        organizationId: organization.id,
        sourceCurrency: "USD",
        targetCurrency: "VND",
        rate: "0",
        source: "manual",
        observedAt: "2026-08-05T09:00:00+07:00",
      }),
    ).toThrow("positive exact decimal");
  });
});
