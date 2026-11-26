import type { CreateExpenseInput } from "./expense.types.js";

export function normalizeExpenseRelationships(input: CreateExpenseInput): CreateExpenseInput {
  return {
    ...input,
    lines: input.lines.map((line) => {
      const lineCategory = line.expenseCategoryCode?.trim() || line.dimensions?.category?.trim();
      const allocationCategories = line.allocations
        .map((allocation) => allocation.dimensions.category?.trim())
        .filter((category): category is string => Boolean(category));
      const categories = [lineCategory, ...allocationCategories].filter(
        (category): category is string => Boolean(category),
      );
      if (new Set(categories).size > 1) throw new Error("CATEGORY_AMBIGUOUS");
      const category = categories[0];
      const lineDimensions = Object.fromEntries(
        Object.entries(line.dimensions ?? {}).filter(([key]) => key !== "category"),
      );
      return {
        ...line,
        ...(category ? { expenseCategoryCode: category } : {}),
        ...(Object.keys(lineDimensions).length ? { dimensions: lineDimensions } : {}),
        allocations: line.allocations.map((allocation) => {
          const allocationDimensions = Object.fromEntries(
            Object.entries(allocation.dimensions).filter(([key]) => key !== "category"),
          );
          return {
            ...allocation,
            dimensions: {
              ...allocationDimensions,
              ...(lineDimensions.projectId && !allocationDimensions.projectId
                ? { projectId: lineDimensions.projectId }
                : {}),
              ...(lineDimensions.contractId && !allocationDimensions.contractId
                ? { contractId: lineDimensions.contractId }
                : {}),
            },
          };
        }),
      };
    }),
  };
}
