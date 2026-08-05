// Business tables are introduced only by their owning ERP tasks.
// This explicit empty schema lets ERP-003 verify migration tooling without premature domain tables.
export const schema = {} as const;
