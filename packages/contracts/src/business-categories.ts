export const BUSINESS_CATEGORY_CONTRACT_VERSION = 1 as const;

export type BusinessCategoryTypeContract = "expense" | "revenue";

export type BusinessCategoryContract = Readonly<{
  organizationId: string;
  kind: BusinessCategoryTypeContract;
  code: string;
  name: string;
  accountCode: string | null;
  taxCode: string | null;
  isActive: boolean;
  version: string;
}>;
