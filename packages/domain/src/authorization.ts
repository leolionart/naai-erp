export const ROLES = [
  "owner",
  "finance_admin",
  "accountant",
  "project_manager",
  "approver",
  "viewer",
  "integration",
] as const;

export type Role = (typeof ROLES)[number];

export type AuthorizationContext = Readonly<{
  actorId: string;
  organizationId: string;
  roles: readonly Role[];
}>;

export function hasRole(context: AuthorizationContext, role: Role): boolean {
  return context.roles.includes(role);
}
