import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION, EXPENSE_REPORT_CONTRACT_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgExpenseReportStore } from "./pg-expense-report.store.js";
import type {
  ExpenseReportContext,
  ExpenseReportDimension,
  ExpenseReportFact,
  ExpenseReportRange,
} from "./expense-report.types.js";

@Injectable()
export class ExpenseReportService {
  constructor(
    @Inject(PgExpenseReportStore) private readonly store: PgExpenseReportStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }
  private validate(range: ExpenseReportRange) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(range.startsOn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(range.endsOn) ||
      range.startsOn > range.endsOn
    )
      throw new Error("VALIDATION_FAILED");
  }
  async report(
    context: ExpenseReportContext,
    range: ExpenseReportRange,
    dimension: ExpenseReportDimension,
  ) {
    this.validate(range);
    const facts = await this.store.facts(context.organizationId, range, dimension);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: this.aggregate(facts, range, dimension),
    };
  }
  aggregate(
    facts: readonly ExpenseReportFact[],
    range: ExpenseReportRange,
    dimension: ExpenseReportDimension,
  ) {
    const months: string[] = [];
    let cursor = new Date(`${range.startsOn.slice(0, 7)}-01T00:00:00Z`);
    const last = range.endsOn.slice(0, 7);
    while (true) {
      const month = cursor.toISOString().slice(0, 7);
      months.push(month);
      if (month === last) break;
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    const currencies = [...new Set(facts.map((fact) => fact.currency))].sort();
    return {
      contractVersion: EXPENSE_REPORT_CONTRACT_VERSION,
      basis: "posted-expense-sources" as const,
      dimension,
      startsOn: range.startsOn,
      endsOn: range.endsOn,
      seriesByCurrency: currencies.map((currency) => {
        const currencyFacts = facts.filter((fact) => fact.currency === currency);
        const keys = [
          ...new Set(currencyFacts.map((fact) => fact.dimensionKey ?? "__unclassified__")),
        ];
        const groups = keys
          .map((rawKey) => {
            const selected = currencyFacts.filter(
              (fact) => (fact.dimensionKey ?? "__unclassified__") === rawKey,
            );
            const key = rawKey === "__unclassified__" ? null : rawKey;
            const name =
              selected.find((fact) => fact.dimensionName)?.dimensionName ??
              (dimension === "payee" ? "Chưa phân loại người nhận" : "Chưa phân loại");
            const sum = (
              rows: readonly ExpenseReportFact[],
              field: "netMinor" | "vatMinor" | "amountMinor",
            ) => rows.reduce((total, fact) => total + BigInt(fact[field]), 0n).toString();
            const monthly = months.map((month) => {
              const monthFacts = selected.filter((fact) => fact.month === month);
              return {
                month,
                netMinor: sum(monthFacts, "netMinor"),
                vatMinor: sum(monthFacts, "vatMinor"),
                grossMinor: sum(monthFacts, "amountMinor"),
                amountMinor: sum(monthFacts, "amountMinor"),
                sourceCount: String(monthFacts.length),
              };
            });
            return {
              key,
              name,
              monthly,
              netMinor: sum(selected, "netMinor"),
              vatMinor: sum(selected, "vatMinor"),
              grossMinor: sum(selected, "amountMinor"),
              totalMinor: sum(selected, "amountMinor"),
              sourceCount: String(selected.length),
              drillDown: {
                resource: dimension === "payee" ? "expenses" : "expense-lines",
                startsOn: range.startsOn,
                endsOn: range.endsOn,
                ...(key
                  ? { [dimension === "payee" ? "payeePartyId" : "expenseCategoryCode"]: key }
                  : { classification: "unclassified" }),
              },
            };
          })
          .sort((a, b) =>
            BigInt(a.totalMinor) === BigInt(b.totalMinor)
              ? a.name.localeCompare(b.name)
              : BigInt(a.totalMinor) > BigInt(b.totalMinor)
                ? -1
                : 1,
          );
        const sourceTotal = currencyFacts.reduce((sum, fact) => sum + BigInt(fact.amountMinor), 0n);
        const groupTotal = groups.reduce((sum, group) => sum + BigInt(group.totalMinor), 0n);
        const sourceNet = currencyFacts.reduce((sum, fact) => sum + BigInt(fact.netMinor), 0n);
        const sourceVat = currencyFacts.reduce((sum, fact) => sum + BigInt(fact.vatMinor), 0n);
        return {
          currency,
          months,
          groups,
          netMinor: sourceNet.toString(),
          vatMinor: sourceVat.toString(),
          grossMinor: sourceTotal.toString(),
          totalMinor: sourceTotal.toString(),
          sourceCount: String(currencyFacts.length),
          reconciliation: {
            groupTotalMinor: groupTotal.toString(),
            sourceTotalMinor: sourceTotal.toString(),
            differenceMinor: (groupTotal - sourceTotal).toString(),
          },
        };
      }),
    };
  }
}
