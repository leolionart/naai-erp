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
import { ExpenseController } from "./expenses/expense.controller.js";
import { ExpenseService } from "./expenses/expense.service.js";
import { PgExpenseStore } from "./expenses/pg-expense.store.js";
import { EvidenceController } from "./evidence/evidence.controller.js";
import { EvidenceService } from "./evidence/evidence.service.js";
import { PgEvidenceStore } from "./evidence/pg-evidence.store.js";
import { EvidenceObjectStorage } from "./evidence/evidence-object-storage.js";
import { InboundWebhookController } from "./inbound-webhooks/inbound-webhook.controller.js";
import { InboundWebhookService } from "./inbound-webhooks/inbound-webhook.service.js";
import { PgInboundWebhookStore } from "./inbound-webhooks/pg-inbound-webhook.store.js";
import { OutboundEventController } from "./outbound-events/outbound-event.controller.js";
import { OutboundEventService } from "./outbound-events/outbound-event.service.js";
import { OUTBOUND_EVENT_ADMIN_STORE } from "./outbound-events/outbound-event.types.js";
import { PgOutboundEventStore } from "./outbound-events/pg-outbound-event.store.js";
import { BankingController } from "./banking/banking.controller.js";
import { BankingService } from "./banking/banking.service.js";
import { BANKING_STORE } from "./banking/banking.types.js";
import { PgBankingStore } from "./banking/pg-banking.store.js";
import { ReconciliationController } from "./reconciliation/reconciliation.controller.js";
import { ReconciliationService } from "./reconciliation/reconciliation.service.js";
import { RECONCILIATION_STORE } from "./reconciliation/reconciliation.types.js";
import { PgReconciliationStore } from "./reconciliation/pg-reconciliation.store.js";

@Module({
  controllers: [
    HealthController,
    MasterDataController,
    JournalController,
    PostingRuleController,
    FiscalPeriodController,
    LedgerReportController,
    CommercialDocumentController,
    ExpenseController,
    EvidenceController,
    InboundWebhookController,
    OutboundEventController,
    BankingController,
    ReconciliationController,
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
    ExpenseService,
    PgExpenseStore,
    EvidenceService,
    PgEvidenceStore,
    EvidenceObjectStorage,
    InboundWebhookService,
    PgInboundWebhookStore,
    OutboundEventService,
    PgOutboundEventStore,
    { provide: OUTBOUND_EVENT_ADMIN_STORE, useExisting: PgOutboundEventStore },
    BankingService,
    PgBankingStore,
    { provide: BANKING_STORE, useExisting: PgBankingStore },
    ReconciliationService,
    PgReconciliationStore,
    { provide: RECONCILIATION_STORE, useExisting: PgReconciliationStore },
  ],
})
export class AppModule {}
