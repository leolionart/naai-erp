import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { CommercialDocumentService } from "./commercial-document.service.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import type {
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
  QuickPurchaseInvoiceInput,
} from "./commercial-document.types.js";

type MasterRow = Record<string, unknown>;

@Injectable()
export class QuickPurchaseInvoiceService {
  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(CommercialDocumentService) private readonly documents: CommercialDocumentService,
  ) {}

  async create(
    context: CommercialDocumentContext,
    input: QuickPurchaseInvoiceInput,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const normalized = this.normalize(input);
    const category = await this.resolveCategory(
      context,
      normalized.category,
      normalized.description,
    );
    const accounts = await this.resolveAccounts(context, category.code, normalized.documentDate);
    const supplier = await this.ensureSupplier(context, normalized, idempotencyKey);
    const allocationId = `quick-${createHash("sha256")
      .update(`${idempotencyKey}:${normalized.documentNumber}`)
      .digest("hex")
      .slice(0, 24)}`;
    const documentInput: CreateCommercialDocumentInput = {
      type: "purchase_invoice",
      documentNumber: normalized.documentNumber,
      ...(normalized.series ? { series: normalized.series } : {}),
      fiscalYear: Number(normalized.documentDate.slice(0, 4)),
      partyId: supplier.partyId,
      documentDate: normalized.documentDate,
      dueDate: normalized.dueDate ?? normalized.documentDate,
      currency: normalized.currency ?? "VND",
      netMinor: normalized.grossMinor,
      taxMinor: "0",
      grossMinor: normalized.grossMinor,
      controlAccountCode: accounts.controlAccountCode,
      lines: [
        {
          description: normalized.description,
          quantity: "1",
          unitPriceMinor: normalized.grossMinor,
          netMinor: normalized.grossMinor,
          taxMinor: "0",
          grossMinor: normalized.grossMinor,
          primaryAccountCode: accounts.primaryAccountCode,
          allocations: [
            {
              id: allocationId,
              amountMinor: normalized.grossMinor,
              dimensions: { category: category.code, taxState: "unreviewed" },
            },
          ],
        },
      ],
      ...(normalized.externalReference
        ? {
            externalReference: {
              ...normalized.externalReference,
              metadata: {
                ...(normalized.externalReference.metadata ?? {}),
                quickIngestion: true,
                supplierTaxId: normalized.supplierTaxId,
                supplierName: normalized.supplierName ?? null,
                categoryInput: normalized.category ?? null,
                categoryResolution: category.disposition,
              },
            },
          }
        : {}),
    };
    const document = await this.documents.create(context, documentInput, idempotencyKey);
    return {
      ...document,
      data: {
        supplier: {
          partyId: supplier.partyId,
          disposition: supplier.disposition,
          roleDisposition: supplier.roleDisposition,
        },
        category,
        document: document.data,
      },
    };
  }

  private normalize(input: QuickPurchaseInvoiceInput) {
    const supplierTaxId = String(input?.supplierTaxId ?? "").replace(/\D/g, "");
    const supplierName = input?.supplierName?.trim();
    const supplierLegalName = input?.supplierLegalName?.trim();
    const documentNumber = input?.documentNumber?.trim();
    const description = input?.description?.trim();
    const category = input?.category?.trim();
    const grossMinor = String(input?.grossMinor ?? "");
    if (
      (input.schemaVersion !== undefined && input.schemaVersion !== 1) ||
      !/^\d{10}(?:\d{3})?$/.test(supplierTaxId) ||
      !documentNumber ||
      !description ||
      !/^\d+$/.test(grossMinor) ||
      BigInt(grossMinor) <= 0n ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate ?? "") ||
      (input.dueDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) ||
      (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency))
    )
      throw new Error("VALIDATION_FAILED");
    return {
      ...input,
      supplierTaxId,
      ...(supplierName ? { supplierName } : {}),
      ...(supplierLegalName ? { supplierLegalName } : {}),
      documentNumber,
      description,
      ...(category ? { category } : {}),
      grossMinor,
    };
  }

  private async rows(resource: string, context: CommercialDocumentContext) {
    return (await this.masterData.export(resource, context)).data as readonly MasterRow[];
  }

  private async ensureSupplier(
    context: CommercialDocumentContext,
    input: ReturnType<QuickPurchaseInvoiceService["normalize"]>,
    idempotencyKey: string,
  ) {
    let parties = await this.rows("parties", context);
    let party = parties.find((row) => String(row.normalized_tax_id ?? "") === input.supplierTaxId);
    let disposition: "existing" | "created" = "existing";
    if (party && String(party.status ?? "active") !== "active")
      throw new Error("SUPPLIER_INACTIVE");
    if (!party) {
      if (!input.supplierName) throw new Error("SUPPLIER_NAME_REQUIRED");
      const partyId = `party-tax-${input.supplierTaxId}`;
      try {
        const created = await this.masterData.mutate(
          "create",
          "parties",
          undefined,
          context,
          {
            data: {
              id: partyId,
              display_name: input.supplierName,
              legal_name: input.supplierLegalName ?? input.supplierName,
              normalized_tax_id: input.supplierTaxId,
              status: "active",
            },
          },
          `${idempotencyKey}:supplier`,
        );
        party = created.data!.resource;
        disposition = "created";
      } catch (error) {
        parties = await this.rows("parties", context);
        party = parties.find((row) => String(row.normalized_tax_id ?? "") === input.supplierTaxId);
        if (!party) throw error;
      }
    }
    const partyId = String(party!.id);
    let roles = await this.rows("party-roles", context);
    let hasRole = roles.some(
      (row) => String(row.party_id) === partyId && String(row.role) === "supplier",
    );
    let roleDisposition: "existing" | "created" = "existing";
    if (!hasRole) {
      try {
        await this.masterData.mutate(
          "create",
          "party-roles",
          undefined,
          context,
          { data: { party_id: partyId, role: "supplier" } },
          `${idempotencyKey}:supplier-role`,
        );
        roleDisposition = "created";
      } catch (error) {
        roles = await this.rows("party-roles", context);
        hasRole = roles.some(
          (row) => String(row.party_id) === partyId && String(row.role) === "supplier",
        );
        if (!hasRole) throw error;
      }
    }
    return { partyId, disposition, roleDisposition };
  }

  private normalizedSearch(value: unknown) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private async resolveCategory(
    context: CommercialDocumentContext,
    categoryInput: string | undefined,
    description: string,
  ) {
    const [dimensions, expenseCategories] = await Promise.all([
      this.rows("dimensions", context),
      this.rows("expense-categories", context),
    ]);
    const expenseCategoriesByCode = new Map(
      expenseCategories.map((row) => [String(row.code ?? ""), row] as const),
    );
    const candidates = dimensions
      .filter((row) => {
        if (String(row.kind) !== "category" || row.is_active === false) return false;
        const expenseCategory = expenseCategoriesByCode.get(String(row.code ?? ""));
        return expenseCategory?.is_active !== false;
      })
      .map((row) => {
        const code = String(row.code ?? "");
        return {
          code,
          name: String(expenseCategoriesByCode.get(code)?.name ?? row.name ?? code),
          aliases: [
            code,
            String(row.name ?? ""),
            String(expenseCategoriesByCode.get(code)?.name ?? ""),
          ].filter(Boolean),
        };
      });
    if (candidates.length === 0) throw new Error("CATEGORY_NOT_FOUND");
    const explicit = this.normalizedSearch(categoryInput);
    if (explicit) {
      const exact = candidates.find((candidate) =>
        candidate.aliases.some((alias) => this.normalizedSearch(alias) === explicit),
      );
      if (exact) return { code: exact.code, name: exact.name, disposition: "exact" as const };
    }
    const stopwords = new Set([
      "chi",
      "phi",
      "dich",
      "vu",
      "mua",
      "vao",
      "hoa",
      "don",
      "thang",
      "nam",
    ]);
    const tokenSet = (value: string) =>
      new Set(
        this.normalizedSearch(value)
          .split(" ")
          .filter((token) => token.length >= 2 && !stopwords.has(token)),
      );
    const primarySearch = categoryInput?.trim() || description;
    const searchTokens = tokenSet(primarySearch);
    const ranked = candidates
      .map((candidate) => {
        const score = Math.max(
          ...candidate.aliases.map((alias) => {
            const normalizedAlias = this.normalizedSearch(alias);
            if (!normalizedAlias) return 0;
            const aliasTokens = tokenSet(alias);
            if (aliasTokens.size === 0) return 0;
            const matched = [...aliasTokens].filter((token) => searchTokens.has(token)).length;
            if (matched < 2) return 0;
            return Math.round((2 * matched * 100) / (aliasTokens.size + searchTokens.size));
          }),
        );
        return { code: candidate.code, score };
      })
      .filter((candidate) => candidate.score >= 67)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
    if (ranked[0] && ranked[0].score - (ranked[1]?.score ?? 0) >= 20) {
      const matched = candidates.find((candidate) => candidate.code === ranked[0]!.code)!;
      return { code: matched.code, name: matched.name, disposition: "similarity" as const };
    }
    if (ranked.length > 0) throw new Error("CATEGORY_AMBIGUOUS");
    throw new Error("CATEGORY_NOT_FOUND");
  }

  private async resolveAccounts(
    context: CommercialDocumentContext,
    category: string,
    documentDate: string,
  ) {
    const [dimensions, mappings, accounts] = await Promise.all([
      this.rows("dimensions", context),
      this.rows("default-mappings", context),
      this.rows("accounts", context),
    ]);
    const categoryExists = dimensions.some(
      (row) =>
        String(row.kind) === "category" && String(row.code) === category && row.is_active !== false,
    );
    if (!categoryExists) throw new Error("CATEGORY_NOT_FOUND");
    const mapping = [...mappings]
      .filter(
        (row) =>
          String(row.category_code) === category &&
          String(row.effective_from) <= documentDate &&
          (!row.effective_to || String(row.effective_to) > documentDate),
      )
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    const activeAccounts = accounts.filter((row) => row.is_active !== false);
    const mappedAccount = mapping
      ? activeAccounts.find((row) => String(row.code) === String(mapping.account_code))
      : undefined;
    const primary =
      mappedAccount ??
      activeAccounts.find((row) => String(row.code) === "642-COST") ??
      activeAccounts.find(
        (row) => String(row.root_type) === "expense" && row.is_control_account !== true,
      );
    const control =
      activeAccounts.find((row) => String(row.code) === "331-AP") ??
      activeAccounts.find(
        (row) => String(row.root_type) === "liability" && row.is_control_account === true,
      );
    if (!primary || !control) throw new Error("QUICK_PURCHASE_ACCOUNT_MAPPING_REQUIRED");
    return {
      primaryAccountCode: String(primary.code),
      controlAccountCode: String(control.code),
    };
  }
}
