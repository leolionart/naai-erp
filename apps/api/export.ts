import pg from "pg";
import { ReportExportService } from "./src/report-exports/report-export.service.js";
import { PgReportExportStore } from "./src/report-exports/pg-report-export.store.js";
import { PgFinancialStatementMaster } from "./src/financial-statements/pg-financial-statement-master.js";
import { FinancialStatementService } from "./src/financial-statements/financial-statement.service.js";
import { EventEmitter } from "node:events";

async function main() {
  const pool = new pg.Pool({
    connectionString: "postgresql://naai_erp:naai_erp_secret@127.0.0.1:5432/naai_erp",
  });
  try {
    const reports = new FinancialStatementService(
      new PgFinancialStatementMaster(pool),
      new EventEmitter(),
    );
    const store = new PgReportExportStore(pool, reports);
    const service = new ReportExportService(store, {
      authenticate: async () => ({
        organizationId: "org-demo",
        actorId: "system",
        correlationId: "test",
        roles: ["org_owner"],
      }),
    } as any);

    const context = {
      organizationId: "org-demo",
      actorId: "system",
      correlationId: "test",
      roles: ["org_owner"],
    } as any;

    console.log("Creating snapshot...");
    const snapshot = await service.createSnapshot(
      context,
      {
        reportKind: "profit_and_loss",
        period: { asOfDate: "2026-12-31", endsOn: "2026-12-31", startsOn: "2026-01-01" },
        accountingBasis: "accrual",
        framework: "TT133",
        formulaVersions: { profit_and_loss: "tt133-mvp-v1" },
        request: {},
      },
      "test-key-3",
    );
    console.log("Snapshot:", snapshot.id);

    console.log("Creating export...");
    const exportRes = await service.createExport(
      context,
      {
        snapshotId: snapshot.id,
        snapshotVersion: 1,
        format: "xlsx",
        reportKind: "profit_and_loss",
      },
      "test-key-ex-3",
    );
    console.log("Export generated:", exportRes.id);
  } finally {
    await pool.end();
  }
}
main().catch(console.error);
