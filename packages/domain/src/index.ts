export const DOMAIN_PACKAGE = "@naai-erp/domain" as const;

export type OrganizationScoped = Readonly<{
  organizationId: string;
}>;
