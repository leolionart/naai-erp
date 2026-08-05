import { Injectable } from "@nestjs/common";
import {
  AGING_BUCKETS,
  buildAgingReport,
  type AgingControlBalance,
  type AgingReportItem,
  type AgingSourceItem,
} from "@naai-erp/domain";
import {
  AGING_CONTRACT_VERSION,
  type AgingExceptionContract,
  type AgingItemContract,
  type AgingReportContract,
} from "@naai-erp/contracts";
import pg from "pg";
import type { AgingQuery, AgingSide, AgingStore } from "./aging.types.js";

type SourceRow = {
  id: string;
  source_type: "commercial_document" | "opening_balance";
  source_id: string;
  party_id: string;
  party_name: string;
  control_account_code: string;
  document_number: string;
  document_date: string;
  due_date: string | null;
  currency: string;
  balance_kind: AgingSourceItem["balanceKind"];
  journal_id: string;
  journal_date: string;
  debit_minor: string;
  credit_minor: string;
  reversal_id: string | null;
  reversal_date: string | null;
};
type AllocationRow = {
  target_id: string;
  id: string;
  journal_id: string | null;
  reconciliation_id: string;
  journal_date: string | null;
  target_amount_minor: string;
  base_amount_minor: string;
  reversal_id: string | null;
  reversal_date: string | null;
};

@Injectable()
export class PgAgingStore implements AgingStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async report(org: string, side: AgingSide, query: AgingQuery): Promise<AgingReportContract> {
    const organization = await this.pool.query<{ base_currency: string; timezone: string }>(
      "select base_currency,timezone from organizations where id=$1",
      [org],
    );
    const organizationRow = organization.rows[0];
    if (!organizationRow) throw new Error("RESOURCE_NOT_FOUND");
    const sources = [
      ...(await this.documentSources(org, side, query.asOf)),
      ...(await this.openingSources(org, side, query.asOf)),
    ];
    const allocations = await this.allocations(org, side);
    const byTarget = new Map<string, AllocationRow[]>();
    for (const allocation of allocations)
      byTarget.set(allocation.target_id, [
        ...(byTarget.get(allocation.target_id) ?? []),
        allocation,
      ]);
    const exceptions: AgingExceptionContract[] = [];
    const supported: AgingSourceItem[] = [];
    for (const row of sources) {
      if (row.currency !== organizationRow.base_currency) {
        exceptions.push({
          code: "AGING_UNSUPPORTED_FX",
          itemId: row.id,
          currency: row.currency,
          message: `No immutable base-currency origin amount is stored for ${row.id}.`,
        });
        continue;
      }
      if (!row.due_date && !["customer_credit", "supplier_advance"].includes(row.balance_kind))
        exceptions.push({
          code: "MISSING_DUE_DATE",
          itemId: row.id,
          message: `Item ${row.id} has no durable due date.`,
        });
      const movements: AgingSourceItem["movements"] = [
        {
          id: `origin:${row.journal_id}`,
          journalId: row.journal_id,
          state: "posted",
          role: "origin",
          effectiveOn: row.journal_date,
          postedOn: row.journal_date,
          debitMinor: BigInt(row.debit_minor),
          creditMinor: BigInt(row.credit_minor),
        },
        ...(row.reversal_id && row.reversal_date
          ? [
              {
                id: `reversal:${row.reversal_id}`,
                journalId: row.reversal_id,
                state: "posted" as const,
                role: "reversal" as const,
                effectiveOn: row.reversal_date,
                postedOn: row.reversal_date,
                debitMinor: BigInt(row.credit_minor),
                creditMinor: BigInt(row.debit_minor),
              },
            ]
          : []),
        ...this.allocationMovements(side, byTarget.get(row.source_id) ?? []),
      ];
      supported.push({
        organizationId: org,
        id: row.id,
        side,
        balanceKind: row.balance_kind,
        sourceType: row.source_type,
        sourceId: row.source_id,
        partyId: row.party_id,
        partyName: row.party_name,
        controlAccountCode: row.control_account_code,
        documentNumber: row.document_number,
        documentDate: row.document_date,
        ...(row.due_date ? { dueDate: row.due_date } : {}),
        currency: row.currency,
        movements,
      });
    }
    const controls = await this.controlBalances(org, side, query.asOf);
    const domain = buildAgingReport({
      organizationId: org,
      side,
      asOf: query.asOf,
      timezone: organizationRow.timezone,
      baseCurrency: organizationRow.base_currency,
      items: supported,
      controlBalances: controls,
      includeSettled: query.includeSettled,
    });
    let items = domain.items.map((item) => this.itemContract(org, item));
    items = items
      .filter((item) => !query.partyId || item.partyId === query.partyId)
      .filter((item) => !query.accountCode || item.controlAccountCode === query.accountCode)
      .filter((item) => !query.bucket || item.bucket === query.bucket)
      .filter((item) => !query.paymentStatus || item.paymentStatus === query.paymentStatus);
    const start = query.cursor
      ? Math.max(0, items.findIndex((item) => item.id === query.cursor) + 1)
      : 0;
    const page = items.slice(start, start + query.limit);
    const controlTies = domain.controlTies.map((tie) => ({
      controlAccountCode: tie.controlAccountCode,
      currency: tie.currency,
      status:
        tie.currency === organizationRow.base_currency ? tie.status : ("unsupported_fx" as const),
      subledgerBalanceMinor: tie.subledgerBalanceMinor.toString(),
      ledgerBalanceMinor: tie.ledgerBalanceMinor.toString(),
      differenceMinor: tie.differenceMinor.toString(),
      subledgerBaseBalanceMinor: tie.subledgerBaseBalanceMinor.toString(),
      ledgerBaseBalanceMinor: tie.ledgerBaseBalanceMinor.toString(),
      baseDifferenceMinor: tie.baseDifferenceMinor.toString(),
    }));
    for (const tie of controlTies)
      if (tie.status === "out_of_balance")
        exceptions.push({
          code: "CONTROL_ACCOUNT_OUT_OF_BALANCE",
          controlAccountCode: tie.controlAccountCode,
          currency: tie.currency,
          message: `Control account ${tie.controlAccountCode} differs by ${tie.differenceMinor}.`,
        });
    return {
      schemaVersion: AGING_CONTRACT_VERSION,
      organizationId: org,
      side,
      asOf: query.asOf,
      timezone: organizationRow.timezone,
      baseCurrency: organizationRow.base_currency,
      source: "posted-ledger",
      filters: {
        ...(query.partyId ? { partyId: query.partyId } : {}),
        ...(query.accountCode ? { accountCode: query.accountCode } : {}),
        ...(query.bucket ? { bucket: query.bucket } : {}),
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
        includeSettled: query.includeSettled,
      },
      bucketTotals: AGING_BUCKETS.map((bucket) => ({
        bucket,
        amountMinor: items
          .filter(
            (item) =>
              item.bucket === bucket &&
              !["customer_credit", "supplier_advance"].includes(item.balanceKind),
          )
          .reduce((sum, item) => sum + BigInt(item.outstandingMinor), 0n)
          .toString(),
        baseAmountMinor: items
          .filter(
            (item) =>
              item.bucket === bucket &&
              !["customer_credit", "supplier_advance"].includes(item.balanceKind),
          )
          .reduce((sum, item) => sum + BigInt(item.baseOutstandingMinor), 0n)
          .toString(),
        itemCount: items.filter(
          (item) =>
            item.bucket === bucket &&
            !["customer_credit", "supplier_advance"].includes(item.balanceKind),
        ).length,
      })),
      creditOrAdvanceTotalMinor: items
        .filter((item) => ["customer_credit", "supplier_advance"].includes(item.balanceKind))
        .reduce((sum, item) => sum + BigInt(item.outstandingMinor), 0n)
        .toString(),
      baseCreditOrAdvanceTotalMinor: items
        .filter((item) => ["customer_credit", "supplier_advance"].includes(item.balanceKind))
        .reduce((sum, item) => sum + BigInt(item.baseOutstandingMinor), 0n)
        .toString(),
      outstandingTotalMinor: items
        .filter((item) => !["customer_credit", "supplier_advance"].includes(item.balanceKind))
        .reduce((sum, item) => sum + BigInt(item.outstandingMinor), 0n)
        .toString(),
      baseOutstandingTotalMinor: items
        .filter((item) => !["customer_credit", "supplier_advance"].includes(item.balanceKind))
        .reduce((sum, item) => sum + BigInt(item.baseOutstandingMinor), 0n)
        .toString(),
      controlTies,
      tieStatus: exceptions.some((e) => e.code === "AGING_UNSUPPORTED_FX")
        ? "unsupported_fx"
        : domain.tieStatus,
      exceptions,
      items: page,
      ...(items[start + query.limit] ? { nextCursor: page.at(-1)!.id } : {}),
    };
  }

  async item(org: string, side: AgingSide, itemId: string, query: AgingQuery) {
    const { cursor, ...withoutCursor } = query;
    void cursor;
    const report = await this.report(org, side, {
      ...withoutCursor,
      includeSettled: true,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const item = report.items.find((candidate) => candidate.id === itemId);
    if (!item) return undefined;
    const controlTie = report.controlTies.find(
      (tie) => tie.controlAccountCode === item.controlAccountCode && tie.currency === item.currency,
    );
    if (!controlTie) return undefined;
    return {
      schemaVersion: AGING_CONTRACT_VERSION,
      asOf: query.asOf,
      item,
      controlTie,
      movementIds: [...item.drilldown.journalIds, ...item.drilldown.reconciliationIds],
    };
  }

  private allocationMovements(
    side: AgingSide,
    rows: AllocationRow[],
  ): AgingSourceItem["movements"] {
    return rows.flatMap((row) => {
      const amount = BigInt(row.target_amount_minor),
        base = BigInt(row.base_amount_minor);
      const settlement = {
        id: row.id,
        ...(row.journal_id ? { journalId: row.journal_id } : {}),
        reconciliationId: row.reconciliation_id,
        state: row.journal_id ? ("posted" as const) : ("matched_reservation" as const),
        role: "settlement" as const,
        effectiveOn: row.journal_date ?? "9999-12-31",
        postedOn: row.journal_date ?? "9999-12-31",
        debitMinor: side === "ap" ? amount : 0n,
        creditMinor: side === "ar" ? amount : 0n,
        baseDebitMinor: side === "ap" ? base : 0n,
        baseCreditMinor: side === "ar" ? base : 0n,
      };
      const reversal =
        row.reversal_id && row.reversal_date
          ? [
              {
                id: `reversal:${row.id}`,
                journalId: row.reversal_id,
                reconciliationId: row.reconciliation_id,
                state: "posted" as const,
                role: "reversal" as const,
                effectiveOn: row.reversal_date,
                postedOn: row.reversal_date,
                debitMinor: side === "ar" ? amount : 0n,
                creditMinor: side === "ap" ? amount : 0n,
                baseDebitMinor: side === "ar" ? base : 0n,
                baseCreditMinor: side === "ap" ? base : 0n,
              },
            ]
          : [];
      return [settlement, ...reversal];
    });
  }

  private async documentSources(org: string, side: AgingSide, asOf: string) {
    const types = side === "ar" ? ["sales_invoice", "credit_note"] : ["purchase_invoice"];
    const r = await this.pool.query<SourceRow>(
      `select 'doc:'||d.id id,'commercial_document' source_type,d.id source_id,d.party_id,p.display_name party_name,d.control_account_code,d.document_number,d.document_date::text,d.due_date::text,d.currency,case when d.type='sales_invoice' then 'receivable' when d.type='credit_note' then 'customer_credit' else 'payable' end balance_kind,j.id journal_id,j.journal_date::text journal_date,case when d.type='sales_invoice' then d.gross_minor else 0 end::text debit_minor,case when d.type<>'sales_invoice' then d.gross_minor else 0 end::text credit_minor,rv.id reversal_id,rv.journal_date::text reversal_date from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id join journal_entries j on j.organization_id=d.organization_id and j.id=d.journal_id left join journal_entries rv on rv.organization_id=j.organization_id and rv.reversal_of_id=j.id where d.organization_id=$1 and d.type=any($3::commercial_document_type[]) and j.journal_date<=$2::date and j.state in('posted','reversed')`,
      [org, asOf, types],
    );
    return r.rows;
  }
  private async openingSources(org: string, side: AgingSide, asOf: string) {
    const r = await this.pool.query<SourceRow>(
      `select 'opening:'||j.id||':'||l.line_number id,'opening_balance' source_type,j.id||':'||l.line_number source_id,l.dimensions->>'partyId' party_id,p.display_name party_name,l.account_code control_account_code,l.dimensions->>'documentRef' document_number,j.journal_date::text document_date,l.dimensions->>'dueDate' due_date,j.currency,case when $3='ar' and l.debit_minor is not null then 'receivable' when $3='ar' then 'customer_credit' when l.credit_minor is not null then 'payable' else 'supplier_advance' end balance_kind,j.id journal_id,j.journal_date::text journal_date,coalesce(l.debit_minor,0)::text debit_minor,coalesce(l.credit_minor,0)::text credit_minor,rv.id reversal_id,rv.journal_date::text reversal_date from opening_balance_imports ob join journal_entries j on j.organization_id=ob.organization_id and j.id=ob.journal_id join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id join accounts a on a.organization_id=l.organization_id and a.code=l.account_code and a.is_control_account join parties p on p.organization_id=l.organization_id and p.id=l.dimensions->>'partyId' left join journal_entries rv on rv.organization_id=j.organization_id and rv.reversal_of_id=j.id where ob.organization_id=$1 and j.journal_date<=$2::date and j.state in('posted','reversed') and (($3='ar' and a.root_type='asset') or ($3='ap' and a.root_type='liability'))`,
      [org, asOf, side],
    );
    return r.rows;
  }
  private async allocations(org: string, side: AgingSide) {
    const target = side === "ar" ? "commercial_document_id" : "commercial_document_id";
    const r = await this.pool.query<AllocationRow>(
      `select a.${target} target_id,a.id,ra.journal_id,ra.id reconciliation_id,sj.journal_date::text journal_date,a.target_amount_minor::text,a.base_amount_minor::text,ra.reversal_journal_id reversal_id,rj.journal_date::text reversal_date from reconciliation_allocations a join reconciliation_attempts ra on ra.organization_id=a.organization_id and ra.id=a.reconciliation_id left join journal_entries sj on sj.organization_id=ra.organization_id and sj.id=ra.journal_id left join journal_entries rj on rj.organization_id=ra.organization_id and rj.id=ra.reversal_journal_id where a.organization_id=$1 and a.commercial_document_id is not null`,
      [org],
    );
    return r.rows;
  }
  private async controlBalances(
    org: string,
    side: AgingSide,
    asOf: string,
  ): Promise<AgingControlBalance[]> {
    const r = await this.pool.query<{ account_code: string; currency: string; balance: string }>(
      `select l.account_code,j.currency,coalesce(sum(case when $3='ar' then coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) else coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0) end),0)::text balance from journal_lines l join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id join accounts a on a.organization_id=l.organization_id and a.code=l.account_code where l.organization_id=$1 and j.journal_date<=$2::date and j.state in('posted','reversed') and a.is_control_account and (($3='ar' and a.root_type='asset') or ($3='ap' and a.root_type='liability')) group by l.account_code,j.currency`,
      [org, asOf, side],
    );
    return r.rows.map((x) => ({
      controlAccountCode: x.account_code,
      currency: x.currency,
      balanceMinor: BigInt(x.balance),
      baseBalanceMinor: BigInt(x.balance),
    }));
  }
  private itemContract(org: string, item: AgingReportItem): AgingItemContract {
    const base = `/api/v1/organizations/${encodeURIComponent(org)}`;
    return {
      id: item.id,
      side: item.side,
      balanceKind: item.balanceKind,
      partyId: item.partyId,
      partyName: item.partyName,
      controlAccountCode: item.controlAccountCode,
      documentNumber: item.documentNumber,
      documentDate: item.documentDate,
      ...(item.dueDate ? { dueDate: item.dueDate } : {}),
      currency: item.currency,
      bucket: item.bucket,
      ...(item.daysOverdue !== undefined ? { daysOverdue: item.daysOverdue } : {}),
      paymentStatus: item.paymentStatus,
      originalMinor: item.originalMinor.toString(),
      settledMinor: item.settledMinor.toString(),
      outstandingMinor: item.outstandingMinor.toString(),
      signedOutstandingMinor: item.signedOutstandingMinor.toString(),
      baseOutstandingMinor: item.baseOutstandingMinor.toString(),
      signedBaseOutstandingMinor: item.signedBaseOutstandingMinor.toString(),
      drilldown: {
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        journalIds: item.journalIds,
        reconciliationIds: item.reconciliationIds,
        evidenceIds: item.evidenceIds,
        sourceHref:
          item.sourceType === "commercial_document"
            ? `${base}/commercial-documents/${encodeURIComponent(item.sourceId)}`
            : `${base}/opening-balances`,
        journalHrefs: item.journalIds.map((id) => `${base}/journals/${encodeURIComponent(id)}`),
        reconciliationHrefs: item.reconciliationIds.map(
          (id) => `${base}/banking/reconciliations/${encodeURIComponent(id)}`,
        ),
        evidenceHrefs: item.evidenceIds.map((id) => `${base}/evidence/${encodeURIComponent(id)}`),
      },
    };
  }
}
