export const DOMAIN_PACKAGE = "@naai-erp/domain" as const;

export type OrganizationScoped = Readonly<{
  organizationId: string;
}>;

export { type AuditActorType, type AuditEvent } from "./audit.js";
export { ROLES, hasRole, type AuthorizationContext, type Role } from "./authorization.js";
export { assertSameOrganization, organizationId, type OrganizationId } from "./organization.js";
