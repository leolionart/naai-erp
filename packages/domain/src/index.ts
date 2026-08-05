export const DOMAIN_PACKAGE = "@naai-erp/domain" as const;

export type OrganizationScoped = Readonly<{
  organizationId: string;
}>;

export { type AuditActorType, type AuditEvent } from "./audit.js";
export {
  ACCOUNT_ROOT_TYPES,
  TAX_KINDS,
  assertNonOverlappingVersions,
  assertValidAccountParent,
  createAccount,
  createStatutoryAccountMapping,
  createTaxCodeVersion,
  resolveEffectiveVersion,
  updateAccount,
  type Account,
  type AccountRootType,
  type StatutoryAccountMapping,
  type StatutoryFramework,
  type TaxCodeVersion,
  type TaxKind,
  type TaxReviewState,
} from "./chart-of-accounts.js";
export { ROLES, hasRole, type AuthorizationContext, type Role } from "./authorization.js";
export { assertSameOrganization, organizationId, type OrganizationId } from "./organization.js";
export {
  FISCAL_PERIOD_STATES,
  createCalendarYearPeriods,
  createExchangeRate,
  createMembership,
  createOrganization,
  currencyCode,
  transitionFiscalPeriod,
  type CurrencyCode,
  type ExchangeRate,
  type FiscalPeriod,
  type FiscalPeriodState,
  type Organization,
  type OrganizationMembership,
} from "./organization-setup.js";
