export const DOMAIN_PACKAGE = "@naai-erp/domain" as const;

export type OrganizationScoped = Readonly<{
  organizationId: string;
}>;

export { type AuditActorType, type AuditEvent } from "./audit.js";
export {
  PARTY_ROLES,
  PROJECT_STATES,
  assertProjectAcceptsAllocation,
  createContract,
  createMilestone,
  createParty,
  createProject,
  mergeParty,
  transitionProject,
  type Contract,
  type ContractType,
  type Milestone,
  type Party,
  type PartyRole,
  type PartyStatus,
  type Project,
  type ProjectState,
} from "./commercial.js";
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
  DIMENSION_KINDS,
  createDimensionRule,
  createDimensionValue,
  createDefaultMapping,
  validateAllocations,
  validateAmountAllocations,
  validateRequiredDimensions,
  type Allocation,
  type AmountAllocation,
  type DefaultMapping,
  type DimensionKind,
  type DimensionRule,
  type DimensionValue,
} from "./dimensions.js";
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
