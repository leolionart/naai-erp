import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { MasterDataController } from "./master-data/master-data.controller.js";
import { MasterDataService } from "./master-data/master-data.service.js";
import { PgMasterDataStore } from "./master-data/pg-master-data.store.js";
import { JournalController } from "./journals/journal.controller.js";
import { JournalService } from "./journals/journal.service.js";
import { PgJournalStore } from "./journals/pg-journal.store.js";
import { PostingRuleController } from "./posting-rules/posting-rule.controller.js";
import { PostingRuleService } from "./posting-rules/posting-rule.service.js";
import { FiscalPeriodController } from "./fiscal-periods/fiscal-period.controller.js";
import { FiscalPeriodService } from "./fiscal-periods/fiscal-period.service.js";
import { PgFiscalPeriodStore } from "./fiscal-periods/pg-fiscal-period.store.js";
import { LedgerReportController } from "./ledger-reports/ledger-report.controller.js";
import { LedgerReportService } from "./ledger-reports/ledger-report.service.js";
import { PgLedgerReportStore } from "./ledger-reports/pg-ledger-report.store.js";
import { CommercialDocumentController } from "./commercial-documents/commercial-document.controller.js";
import { CommercialDocumentService } from "./commercial-documents/commercial-document.service.js";
import { PgCommercialDocumentStore } from "./commercial-documents/pg-commercial-document.store.js";

@Module({
  controllers: [
    HealthController,
    MasterDataController,
    JournalController,
    PostingRuleController,
    FiscalPeriodController,
    LedgerReportController,
    CommercialDocumentController,
  ],
  providers: [
    MasterDataService,
    PgMasterDataStore,
    JournalService,
    PgJournalStore,
    PostingRuleService,
    FiscalPeriodService,
    PgFiscalPeriodStore,
    LedgerReportService,
    PgLedgerReportStore,
    CommercialDocumentService,
    PgCommercialDocumentStore,
  ],
})
export class AppModule {}
