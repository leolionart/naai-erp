import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { assertMasterBaseCurrency } from "../common/base-currency-guard.js";
import { FundingRulesService } from "../funding-rules/funding-rules.service.js";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
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
    @Optional() @Inject(FundingRulesService) private readonly fundingRules?: FundingRulesService,
  ) {}

  async create(
    context: CommercialDocumentContext,
    input: QuickPurchaseInvoiceInput,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const normalized = this.normalize(input);
    await assertMasterBaseCurrency(
      this.masterData,
      context.organizationId,
      normalized.currency ?? "VND",
    );
    const category = await this.resolveCategory(
      context,
      normalized.category,
      normalized.description,
      normalized.supplierTaxId,
    );
    const accounts = await this.resolveAccounts(context, category.code, normalized.documentDate);
    const supplier = await this.ensureSupplier(context, normalized, idempotencyKey);
    const allocationId = `quick-${createHash("sha256")
      .update(`${idempotencyKey}:${normalized.documentNumber}`)
      .digest("hex")
      .slice(0, 24)}`;
    let taxMinor = normalized.taxMinor;
    let netMinor = normalized.netMinor;
    let taxAccountCode = normalized.taxAccountCode;
    let taxCode = normalized.taxCode;
    let vatState = normalized.vatState;
    let vatEligibleMinor = normalized.vatEligibleMinor;

    // Auto-derive standard VAT for known utility suppliers when OCR omitted net/tax
    if (taxMinor === undefined && netMinor === undefined) {
      const isEvn =
        normalized.supplierTaxId.startsWith("0300951119") ||
        normalized.supplierTaxId.startsWith("0300942001");
      if (isEvn) {
        const gross = BigInt(normalized.grossMinor);
        // Round to nearest VND integer: (gross * 100 + 54) / 108
        const derivedNet = (gross * 100n + 54n) / 108n;
        const derivedTax = gross - derivedNet;
        netMinor = derivedNet.toString();
        taxMinor = derivedTax.toString();
        taxAccountCode = taxAccountCode ?? "1331-VAT";
        taxCode = taxCode ?? "VAT8_IN";
        vatState = vatState ?? "eligible";
        vatEligibleMinor = vatEligibleMinor ?? taxMinor;
      }
    }

    taxMinor = taxMinor ?? "0";
    netMinor = netMinor ?? (BigInt(normalized.grossMinor) - BigInt(taxMinor)).toString();
    vatState =
      vatState ??
      (vatEligibleMinor !== undefined
        ? BigInt(vatEligibleMinor) === BigInt(taxMinor)
          ? "eligible"
          : BigInt(vatEligibleMinor) > 0n
            ? "partially_eligible"
            : "ineligible"
        : normalized.taxMinor !== undefined
          ? BigInt(taxMinor) > 0n
            ? "unreviewed"
            : "ineligible"
          : "unreviewed");
    const resolvedFunding =
      normalized.funding ??
      (this.fundingRules
        ? (
            await this.fundingRules.resolveForIngestion(context.organizationId, {
              externalSystem: normalized.externalReference?.system,
              supplierTaxId: normalized.supplierTaxId,
              partyId: supplier.partyId,
              categoryCode: category.code,
              description: normalized.description,
              grossMinor: normalized.grossMinor,
            })
          ).resolvedFunding
        : { type: "owner_paid" as const });
    const documentInput: CreateCommercialDocumentInput = {
      type: "purchase_invoice",
      documentNumber: normalized.documentNumber,
      ...(normalized.series ? { series: normalized.series } : {}),
      fiscalYear: Number(normalized.documentDate.slice(0, 4)),
      partyId: supplier.partyId,
      documentDate: normalized.documentDate,
      dueDate: normalized.dueDate ?? normalized.documentDate,
      currency: normalized.currency ?? "VND",
      netMinor,
      taxMinor,
      grossMinor: normalized.grossMinor,
      controlAccountCode: accounts.controlAccountCode,
      funding: resolvedFunding,
      ...mergePaymentEvidenceFields(input),
      lines: [
        {
          description: normalized.description,
          quantity: "1",
          unitPriceMinor: netMinor,
          netMinor,
          taxMinor,
          grossMinor: normalized.grossMinor,
          primaryAccountCode: accounts.primaryAccountCode,
          ...(taxAccountCode ? { taxAccountCode } : {}),
          ...(taxCode ? { taxCode } : {}),
          categoryCode: category.code,
          allocations: [
            {
              id: allocationId,
              amountMinor: netMinor,
              dimensions: {
                taxState: vatState,
                ...(vatEligibleMinor !== undefined ? { vatEligibleMinor } : {}),
              },
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
    const taxMinor = input?.taxMinor === undefined ? "0" : String(input.taxMinor);
    const netMinor = input?.netMinor === undefined ? undefined : String(input.netMinor);
    const vatEligibleMinor =
      input?.vatEligibleMinor === undefined ? undefined : String(input.vatEligibleMinor);
    const taxCode = input?.taxCode?.trim();
    const taxAccountCode = input?.taxAccountCode?.trim();
    if (
      (input.schemaVersion !== undefined && input.schemaVersion !== 1) ||
      (!supplierTaxId && !supplierName) ||
      (input?.supplierTaxId !== undefined && !/^\d{10}(?:\d{3})?$/.test(supplierTaxId)) ||
      !documentNumber ||
      !description ||
      !/^\d+$/.test(grossMinor) ||
      BigInt(grossMinor) <= 0n ||
      !/^\d+$/.test(taxMinor) ||
      BigInt(taxMinor) >= BigInt(grossMinor) ||
      (netMinor !== undefined && (!/^\d+$/.test(netMinor) || BigInt(netMinor) <= 0n)) ||
      (vatEligibleMinor !== undefined && !/^\d+$/.test(vatEligibleMinor)) ||
      (input.vatState !== undefined &&
        ![
          "unreviewed",
          "eligible",
          "partially_eligible",
          "ineligible",
          "accountant_override",
        ].includes(input.vatState)) ||
      (BigInt(taxMinor) > 0n && !taxAccountCode) ||
      (BigInt(taxMinor) === 0n && taxAccountCode) ||
      (netMinor !== undefined && BigInt(netMinor) + BigInt(taxMinor) !== BigInt(grossMinor)) ||
      (vatEligibleMinor !== undefined && BigInt(vatEligibleMinor) > BigInt(taxMinor)) ||
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
      ...(netMinor !== undefined ? { netMinor } : {}),
      ...(input.taxMinor !== undefined ? { taxMinor } : {}),
      ...(taxCode ? { taxCode } : {}),
      ...(taxAccountCode ? { taxAccountCode } : {}),
      ...(input.vatState ? { vatState: input.vatState } : {}),
      ...(vatEligibleMinor !== undefined ? { vatEligibleMinor } : {}),
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
    const normalizedName = this.normalizeName(input.supplierName);
    const matches = input.supplierTaxId
      ? parties.filter((row) => String(row.normalized_tax_id ?? "") === input.supplierTaxId)
      : parties.filter(
          (row) =>
            String(row.status ?? "active") === "active" &&
            [row.display_name, row.legal_name].some(
              (value) => this.normalizeName(value) === normalizedName,
            ),
        );
    if (matches.length > 1) throw new Error("SUPPLIER_AMBIGUOUS");
    let party = matches[0];
    let disposition: "existing" | "created" = "existing";
    if (party && String(party.status ?? "active") !== "active")
      throw new Error("SUPPLIER_INACTIVE");
    if (!party) {
      if (!input.supplierName) throw new Error("SUPPLIER_NAME_REQUIRED");
      const identity = input.supplierTaxId || normalizedName;
      const partyId = input.supplierTaxId
        ? `party-tax-${input.supplierTaxId}`
        : `party-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
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
              ...(input.supplierTaxId ? { normalized_tax_id: input.supplierTaxId } : {}),
              status: "active",
            },
          },
          `${idempotencyKey}:supplier`,
        );
        party = created.data!.resource;
        disposition = "created";
      } catch (error) {
        parties = await this.rows("parties", context);
        party = input.supplierTaxId
          ? parties.find((row) => String(row.normalized_tax_id ?? "") === input.supplierTaxId)
          : parties.find(
              (row) =>
                String(row.status ?? "active") === "active" &&
                [row.display_name, row.legal_name].some(
                  (value) => this.normalizeName(value) === normalizedName,
                ),
            );
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

  private normalizeName(value: unknown) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
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
    supplierTaxId?: string,
  ) {
    const categories = await this.rows("categories", context);
    const legacy = categories.length ? categories : await this.rows("dimensions", context);
    const candidates = legacy
      .filter((row) => {
        return ["expense", "category"].includes(String(row.kind)) && row.is_active !== false;
      })
      .map((row) => {
        const code = String(row.code ?? "");
        return {
          code,
          name: String(row.name ?? code),
          aliases: [code, String(row.name ?? ""), String(row.name ?? "")].filter(Boolean),
        };
      });
    if (candidates.length === 0) throw new Error("CATEGORY_NOT_FOUND");

    // Rule 1: Utility supplier tax ID recognition (EVN, Telecom, etc.)
    if (supplierTaxId) {
      if (supplierTaxId.startsWith("0300951119") || supplierTaxId.startsWith("0300942001")) {
        const evn = candidates.find((c) => c.code === "ELECTRICITY_WATER");
        if (evn) return { code: evn.code, name: evn.name, disposition: "exact" as const };
      }
      if (supplierTaxId.startsWith("0101778163")) {
        const telecom = candidates.find((c) => c.code === "INTERNET_TELECOM");
        if (telecom)
          return { code: telecom.code, name: telecom.name, disposition: "exact" as const };
      }
    }

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
    const [categories, mappings, accounts] = await Promise.all([
      this.rows("categories", context),
      this.rows("default-mappings", context),
      this.rows("accounts", context),
    ]);
    const categoryCatalog = categories.length ? categories : await this.rows("dimensions", context);
    const categoryExists = categoryCatalog.some(
      (row) =>
        ["expense", "category"].includes(String(row.kind)) &&
        String(row.code) === category &&
        row.is_active !== false,
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
      activeAccounts.find((row) => String(row.code) === "642-OPEX") ??
      activeAccounts.find((row) => String(row.code) === "642-COST") ??
      activeAccounts.find(
        (row) =>
          String(row.root_type) === "expense" &&
          row.is_control_account !== true &&
          String(row.code) !== "632-COGS",
      ) ??
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
