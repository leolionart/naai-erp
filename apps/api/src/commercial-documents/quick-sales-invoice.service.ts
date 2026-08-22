import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { CommercialDocumentService } from "./commercial-document.service.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import type {
  CommercialDocumentContext,
  QuickSalesInvoiceInput,
} from "./commercial-document.types.js";

type Row = Record<string, unknown>;

@Injectable()
export class QuickSalesInvoiceService {
  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(CommercialDocumentService) private readonly documents: CommercialDocumentService,
  ) {}
  private norm(value: unknown) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  private async rows(resource: string, context: CommercialDocumentContext) {
    return ((await this.masterData.export(resource, context)).data ?? []) as readonly Row[];
  }
  async create(
    context: CommercialDocumentContext,
    input: QuickSalesInvoiceInput,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const customerName = input?.customerName?.trim();
    const customerTaxId = String(input?.customerTaxId ?? "").replace(/\D/g, "");
    const documentNumber = input?.documentNumber?.trim();
    const description = input?.description?.trim();
    const grossMinor = String(input?.grossMinor ?? "");
    if (
      (input.schemaVersion !== undefined && input.schemaVersion !== 1) ||
      !customerName ||
      (customerTaxId && !/^\d{10}(?:\d{3})?$/.test(customerTaxId)) ||
      !documentNumber ||
      !description ||
      !/^\d+$/.test(grossMinor) ||
      BigInt(grossMinor) <= 0n ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate ?? "")
    )
      throw new Error("VALIDATION_FAILED");
    const [parties, roles, projects, dimensions, accounts] = await Promise.all([
      this.rows("parties", context),
      this.rows("party-roles", context),
      this.rows("projects", context),
      this.rows("dimensions", context),
      this.rows("accounts", context),
    ]);
    const activeParties = parties.filter((p) => String(p.status ?? "active") === "active");
    const matches = customerTaxId
      ? activeParties.filter((p) => String(p.normalized_tax_id ?? "") === customerTaxId)
      : activeParties.filter(
          (p) =>
            this.norm(p.display_name) === this.norm(customerName) ||
            this.norm(p.legal_name) === this.norm(customerName),
        );
    if (matches.length > 1) throw new Error("CUSTOMER_AMBIGUOUS");
    let party = matches[0];
    let partyDisposition: "existing" | "created" = "existing";
    if (!party) {
      const id = `party-${createHash("sha256")
        .update(customerTaxId || this.norm(customerName))
        .digest("hex")
        .slice(0, 24)}`;
      party = (
        await this.masterData.mutate(
          "create",
          "parties",
          undefined,
          context,
          {
            data: {
              id,
              display_name: customerName,
              legal_name: customerName,
              ...(customerTaxId ? { normalized_tax_id: customerTaxId } : {}),
              status: "active",
            },
          },
          `${idempotencyKey}:customer`,
        )
      ).data!.resource;
      partyDisposition = "created";
    }
    const partyId = String(party.id);
    let roleDisposition: "existing" | "created" = "existing";
    if (!roles.some((r) => String(r.party_id) === partyId && String(r.role) === "client")) {
      await this.masterData.mutate(
        "create",
        "party-roles",
        undefined,
        context,
        { data: { party_id: partyId, role: "client" } },
        `${idempotencyKey}:client-role`,
      );
      roleDisposition = "created";
    }
    let project: Row | undefined;
    if (input.project?.trim()) {
      const key = this.norm(input.project);
      const projectMatches = projects.filter(
        (p) => p.is_active !== false && [p.id, p.code, p.name].some((v) => this.norm(v) === key),
      );
      if (projectMatches.length === 0) throw new Error("PROJECT_NOT_FOUND");
      if (projectMatches.length > 1) throw new Error("PROJECT_AMBIGUOUS");
      project = projectMatches[0];
      if (project?.client_party_id && String(project.client_party_id) !== partyId)
        throw new Error("PROJECT_CUSTOMER_MISMATCH");
    }
    const categoryKey = this.norm(input.category);
    const categoryMatches = categoryKey
      ? dimensions.filter(
          (d) =>
            String(d.kind) === "category" &&
            d.is_active !== false &&
            [d.code, d.name].some((v) => this.norm(v) === categoryKey),
        )
      : [];
    if (categoryMatches.length > 1) throw new Error("CATEGORY_AMBIGUOUS");
    if (categoryKey && categoryMatches.length === 0) throw new Error("CATEGORY_NOT_FOUND");
    const revenue =
      accounts.find((a) => a.is_active !== false && String(a.code) === "511-REVENUE") ??
      accounts.find(
        (a) =>
          a.is_active !== false &&
          String(a.root_type) === "revenue" &&
          a.is_control_account !== true,
      );
    const control =
      accounts.find((a) => a.is_active !== false && String(a.code) === "131-AR") ??
      accounts.find(
        (a) =>
          a.is_active !== false && String(a.root_type) === "asset" && a.is_control_account === true,
      );
    if (!revenue || !control) throw new Error("QUICK_SALES_ACCOUNT_MAPPING_REQUIRED");
    const dimensionsOut: Record<string, string> = {};
    if (categoryMatches[0]) dimensionsOut.category = String(categoryMatches[0].code);
    if (project) dimensionsOut.projectId = String(project.id);
    const response = await this.documents.create(
      context,
      {
        type: "sales_invoice",
        documentNumber,
        ...(input.series?.trim() ? { series: input.series.trim() } : {}),
        fiscalYear: Number(input.documentDate.slice(0, 4)),
        partyId,
        documentDate: input.documentDate,
        dueDate: input.dueDate ?? input.documentDate,
        currency: input.currency ?? "VND",
        netMinor: grossMinor,
        taxMinor: "0",
        grossMinor,
        controlAccountCode: String(control.code),
        lines: [
          {
            description,
            quantity: "1",
            unitPriceMinor: grossMinor,
            netMinor: grossMinor,
            taxMinor: "0",
            grossMinor,
            primaryAccountCode: String(revenue.code),
            allocations: [
              {
                id: `quick-${createHash("sha256").update(`${idempotencyKey}:${documentNumber}`).digest("hex").slice(0, 24)}`,
                amountMinor: grossMinor,
                dimensions: dimensionsOut,
              },
            ],
          },
        ],
        ...(input.externalReference
          ? {
              externalReference: {
                ...input.externalReference,
                metadata: { ...(input.externalReference.metadata ?? {}), quickIngestion: true },
              },
            }
          : {}),
      },
      idempotencyKey,
    );
    return {
      ...response,
      data: {
        customer: { partyId, disposition: partyDisposition, roleDisposition },
        project: project ? { id: String(project.id), disposition: "exact" } : null,
        document: response.data,
      },
    };
  }
}
