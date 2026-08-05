import { organizationId, type OrganizationId } from "./organization.js";
import type { Role } from "./authorization.js";

export type Organization = Readonly<{
  id: OrganizationId;
  legalName: string;
  baseCurrency: CurrencyCode;
  timezone: string;
}>;

export type OrganizationMembership = Readonly<{
  organizationId: OrganizationId;
  userId: string;
  roles: readonly Role[];
}>;

export const FISCAL_PERIOD_STATES = ["open", "soft_locked", "hard_locked"] as const;
export type FiscalPeriodState = (typeof FISCAL_PERIOD_STATES)[number];

export type FiscalPeriod = Readonly<{
  organizationId: OrganizationId;
  fiscalYear: number;
  periodNumber: number;
  startsOn: string;
  endsOn: string;
  state: FiscalPeriodState;
}>;

export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

export type ExchangeRate = Readonly<{
  organizationId: OrganizationId;
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: string;
  source: string;
  observedAt: string;
}>;

export function currencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Currency code must be a three-letter ISO 4217 code");
  }
  return normalized as CurrencyCode;
}

export function createOrganization(input: {
  id: string;
  legalName: string;
  baseCurrency: string;
  timezone: string;
}): Organization {
  const legalName = input.legalName.trim();
  if (!legalName) throw new Error("Organization legal name is required");
  if (!input.timezone.trim()) throw new Error("Organization timezone is required");
  return {
    id: organizationId(input.id),
    legalName,
    baseCurrency: currencyCode(input.baseCurrency),
    timezone: input.timezone.trim(),
  };
}

export function createMembership(input: {
  organizationId: string;
  userId: string;
  roles: readonly Role[];
}): OrganizationMembership {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Membership user ID is required");
  const roles = [...new Set(input.roles)];
  if (roles.length === 0) throw new Error("Membership requires at least one role");
  return { organizationId: organizationId(input.organizationId), userId, roles };
}

export function createCalendarYearPeriods(
  organization: Organization,
  fiscalYear: number,
): readonly FiscalPeriod[] {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9999) {
    throw new Error("Fiscal year must be a four-digit integer");
  }
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const startsOn = `${fiscalYear}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(fiscalYear, month, 1));
    const endsOn = new Date(nextMonth.getTime() - 86_400_000).toISOString().slice(0, 10);
    return {
      organizationId: organization.id,
      fiscalYear,
      periodNumber: month,
      startsOn,
      endsOn,
      state: "open" as const,
    };
  });
}

export function transitionFiscalPeriod(
  period: FiscalPeriod,
  nextState: FiscalPeriodState,
): FiscalPeriod {
  const allowed: Record<FiscalPeriodState, readonly FiscalPeriodState[]> = {
    open: ["soft_locked", "hard_locked"],
    soft_locked: ["open", "hard_locked"],
    hard_locked: ["open"],
  };
  if (!allowed[period.state].includes(nextState)) {
    throw new Error(`Invalid fiscal period transition: ${period.state} -> ${nextState}`);
  }
  return { ...period, state: nextState };
}

export function createExchangeRate(input: {
  organizationId: string;
  sourceCurrency: string;
  targetCurrency: string;
  rate: string;
  source: string;
  observedAt: string;
}): ExchangeRate {
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(input.rate) ||
    BigInt(input.rate.replace(".", "")) <= 0n
  ) {
    throw new Error("Exchange rate must be a positive exact decimal string");
  }
  if (!input.source.trim()) throw new Error("Exchange rate source is required");
  if (Number.isNaN(Date.parse(input.observedAt)))
    throw new Error("Exchange rate timestamp is invalid");
  const sourceCurrency = currencyCode(input.sourceCurrency);
  const targetCurrency = currencyCode(input.targetCurrency);
  if (sourceCurrency === targetCurrency) throw new Error("Exchange rate currencies must differ");
  return {
    organizationId: organizationId(input.organizationId),
    sourceCurrency,
    targetCurrency,
    rate: input.rate,
    source: input.source.trim(),
    observedAt: input.observedAt,
  };
}
