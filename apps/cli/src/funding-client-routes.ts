export function resolveFundingClientPath(
  resource: string,
  action: string,
  base: string,
  key?: string,
): string | undefined {
  if (resource === "account-plans") {
    if (["dry-run", "commit"].includes(action)) return `${base}/${action}`;
    throw new Error(`Unsupported account-plans action: ${action}`);
  }
  if (resource === "owner-custody-migration") {
    if (["dry-run", "commit"].includes(action)) return `${base}/${action}`;
    throw new Error(`Unsupported owner-custody-migration action: ${action}`);
  }
  if (resource === "funding-plans") {
    if (["export", "unlinked", "dry-run", "commit"].includes(action)) return `${base}/${action}`;
    if (action === "owner-custody-dry-run") return `${base}/owner-custody-migration/dry-run`;
    if (action === "owner-custody-commit") return `${base}/owner-custody-migration/commit`;
    throw new Error(`Unsupported funding-plans action: ${action}`);
  }
  if (resource === "funding-rules") {
    if (action === "set-default") return `${base}/default`;
    if (action === "test") return `${base}/test`;
    if (["update", "delete"].includes(action)) {
      if (!key) throw new Error(`funding-rules ${action} requires --key`);
      return `${base}/${encodeURIComponent(key)}`;
    }
    return base;
  }
  return undefined;
}
