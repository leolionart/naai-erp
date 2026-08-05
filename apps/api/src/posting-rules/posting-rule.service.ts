import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import {
  createPostingRule,
  mapDocumentToJournalDraft,
  type JournalDimensions,
} from "@naai-erp/domain";
import pg from "pg";
import { MasterDataService } from "../master-data/master-data.service.js";
import type { ActorContext } from "../master-data/master-data.types.js";

export type EvaluateInput = Readonly<{
  journalId: string;
  documentType: string;
  documentId: string;
  postingDate: string;
  baseCurrency: string;
  description: string;
  sourceLines: readonly {
    id: string;
    amountMinor: string;
    sourceAccountId?: string;
    categoryCode?: string;
    taxCode?: string;
    description?: string;
    dimensions?: JournalDimensions;
  }[];
}>;

@Injectable()
export class PostingRuleService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(@Inject(MasterDataService) private readonly masterData: MasterDataService) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  async evaluate(context: ActorContext, input: EvaluateInput) {
    const result = await this.pool.query<{
      rule_id: string;
      version: number;
      document_type: string;
      effective_from: string;
      effective_to: string | null;
      conditions: Record<string, unknown>;
      line_templates: readonly Record<string, unknown>[];
    }>(
      `select rule_id,version,document_type,effective_from::text,effective_to::text,conditions,line_templates
       from posting_rule_versions
       where organization_id=$1 and status='active' and document_type=$2
         and effective_from <= $3 and (effective_to is null or effective_to >= $3)
       order by priority asc, effective_from desc, version desc, rule_id asc`,
      [context.organizationId, input.documentType, input.postingDate],
    );
    const rules = result.rows.map((row) => {
      const debit = row.line_templates.find((line) => line.side === "debit");
      const credit = row.line_templates.find((line) => line.side === "credit");
      if (!debit?.accountCode || !credit?.accountCode) throw new Error("INVALID_POSTING_RULE");
      return createPostingRule({
        organizationId: context.organizationId,
        id: row.rule_id,
        version: row.version,
        documentType: row.document_type,
        effectiveFrom: row.effective_from,
        ...(row.effective_to ? { effectiveTo: row.effective_to } : {}),
        ...(typeof row.conditions.sourceAccountId === "string"
          ? { sourceAccountId: row.conditions.sourceAccountId }
          : {}),
        ...(typeof row.conditions.categoryCode === "string"
          ? { categoryCode: row.conditions.categoryCode }
          : {}),
        ...(typeof row.conditions.taxCode === "string" ? { taxCode: row.conditions.taxCode } : {}),
        debitAccountId: String(debit.accountCode),
        creditAccountId: String(credit.accountCode),
        requiredDimensions: Array.isArray(row.conditions.requiredDimensions)
          ? (row.conditions.requiredDimensions as never)
          : [],
      });
    });
    const mapped = mapDocumentToJournalDraft({
      ...input,
      organizationId: context.organizationId,
      sourceLines: input.sourceLines.map((line) => ({
        ...line,
        amountMinor: BigInt(line.amountMinor),
        ...(line.dimensions ? { dimensions: line.dimensions } : {}),
      })),
      rules,
    });
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        journal: {
          ...mapped.journal,
          lines: mapped.journal.lines.map((line) => ({
            ...line,
            ...(line.debitMinor !== undefined ? { debitMinor: line.debitMinor.toString() } : {}),
            ...(line.creditMinor !== undefined ? { creditMinor: line.creditMinor.toString() } : {}),
          })),
        },
        appliedRules: mapped.appliedRules,
      },
    };
  }
}
