export const TT133_MVP_SEED_VERSION: "tt133-mvp-v1";

export type Tt133MvpSeedOptions = Readonly<{
  organizationId?: string;
  legalName?: string;
  fiscalYear?: number;
}>;

export function seedTt133Mvp(
  client: Readonly<{ query(text: string, values?: readonly unknown[]): Promise<unknown> }>,
  options?: Tt133MvpSeedOptions,
): Promise<
  Readonly<{ organizationId: string; fiscalYear: number; mappingId: string; synthetic: true }>
>;
