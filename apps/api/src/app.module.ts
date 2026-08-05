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
import { InternalTransferController } from "./internal-transfers/internal-transfer.controller.js";
import { InternalTransferCandidateController } from "./internal-transfers/internal-transfer-candidate.controller.js";
import { InternalTransferService } from "./internal-transfers/internal-transfer.service.js";
import { INTERNAL_TRANSFER_STORE } from "./internal-transfers/internal-transfer.types.js";
import { PgInternalTransferStore } from "./internal-transfers/pg-internal-transfer.store.js";
import { DiscoveryController } from "./discovery/discovery.controller.js";
import { AgingController } from "./aging/aging.controller.js";
import { AgingService } from "./aging/aging.service.js";
import { AGING_STORE } from "./aging/aging.types.js";
import { PgAgingStore } from "./aging/pg-aging.store.js";
import { BankingControlController } from "./banking-controls/banking-control.controller.js";
import { BankingControlService } from "./banking-controls/banking-control.service.js";
import { BANKING_CONTROL_STORE } from "./banking-controls/banking-control.types.js";
import { PgBankingControlStore } from "./banking-controls/pg-banking-control.store.js";
import { WorkforceController } from "./workforce/workforce.controller.js";
import { WorkforceService } from "./workforce/workforce.service.js";
import { WORKFORCE_STORE } from "./workforce/workforce.types.js";
import { PgWorkforceStore } from "./workforce/pg-workforce.store.js";
import { ProjectCostController } from "./project-costs/project-cost.controller.js";
import { ProjectCostService } from "./project-costs/project-cost.service.js";
import { PROJECT_COST_STORE } from "./project-costs/project-cost.types.js";
import { PgProjectCostStore } from "./project-costs/pg-project-cost.store.js";
import { ProjectRecognitionController } from "./project-recognition/project-recognition.controller.js";
import { ProjectRecognitionService } from "./project-recognition/project-recognition.service.js";
import { PROJECT_RECOGNITION_STORE } from "./project-recognition/project-recognition.types.js";
import { PgProjectRecognitionStore } from "./project-recognition/pg-project-recognition.store.js";
import {
  OverheadPolicyController,
  OverheadRunController,
  OverheadSourcePoolController,
} from "./overhead-allocations/overhead-allocation.controller.js";
import { OverheadAllocationService } from "./overhead-allocations/overhead-allocation.service.js";
import { OVERHEAD_ALLOCATION_STORE } from "./overhead-allocations/overhead-allocation.types.js";
import { PgOverheadAllocationStore } from "./overhead-allocations/pg-overhead-allocation.store.js";
import { ProjectProfitabilityController } from "./project-profitability/project-profitability.controller.js";
import { ProjectProfitabilityService } from "./project-profitability/project-profitability.service.js";
import { PROJECT_PROFITABILITY_STORE } from "./project-profitability/project-profitability.types.js";
import { PgProjectProfitabilityStore } from "./project-profitability/pg-project-profitability.store.js";
import {
  ForecastVersionController,
  RevenueTargetController,
} from "./planning/planning.controller.js";
import { PlanningService } from "./planning/planning.service.js";
import { PLANNING_STORE } from "./planning/planning.types.js";
import { PgPlanningStore } from "./planning/pg-planning.store.js";

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
    InternalTransferController,
    InternalTransferCandidateController,
    DiscoveryController,
    AgingController,
    BankingControlController,
    WorkforceController,
    ProjectCostController,
    ProjectRecognitionController,
    OverheadPolicyController,
    OverheadSourcePoolController,
    OverheadRunController,
    ProjectProfitabilityController,
    RevenueTargetController,
    ForecastVersionController,
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
    InternalTransferService,
    PgInternalTransferStore,
    { provide: INTERNAL_TRANSFER_STORE, useExisting: PgInternalTransferStore },
    AgingService,
    PgAgingStore,
    { provide: AGING_STORE, useExisting: PgAgingStore },
    BankingControlService,
    PgBankingControlStore,
    { provide: BANKING_CONTROL_STORE, useExisting: PgBankingControlStore },
    WorkforceService,
    PgWorkforceStore,
    { provide: WORKFORCE_STORE, useExisting: PgWorkforceStore },
    ProjectCostService,
    PgProjectCostStore,
    { provide: PROJECT_COST_STORE, useExisting: PgProjectCostStore },
    ProjectRecognitionService,
    PgProjectRecognitionStore,
    { provide: PROJECT_RECOGNITION_STORE, useExisting: PgProjectRecognitionStore },
    OverheadAllocationService,
    PgOverheadAllocationStore,
    { provide: OVERHEAD_ALLOCATION_STORE, useExisting: PgOverheadAllocationStore },
    ProjectProfitabilityService,
    PgProjectProfitabilityStore,
    { provide: PROJECT_PROFITABILITY_STORE, useExisting: PgProjectProfitabilityStore },
    PlanningService,
    PgPlanningStore,
    { provide: PLANNING_STORE, useExisting: PgPlanningStore },
  ],
})
export class AppModule {}
