export type OrganizationId = string & { readonly __brand: "OrganizationId" };

export function organizationId(value: string): OrganizationId {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Organization ID is required");
  }
  return normalized as OrganizationId;
}

export function assertSameOrganization(expected: OrganizationId, actual: OrganizationId): void {
  if (expected !== actual) {
    throw new Error("Cross-organization access is forbidden");
  }
}
