import { Module } from "@nestjs/common";
import { DatabaseReadinessService, HealthController } from "./health.controller.js";
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
import { ForecastComponentController } from "./forecast-components/forecast-component.controller.js";
import { ForecastComponentService } from "./forecast-components/forecast-component.service.js";
import { FORECAST_COMPONENT_STORE } from "./forecast-components/forecast-component.types.js";
import { PgForecastComponentStore } from "./forecast-components/pg-forecast-component.store.js";
import { PerformanceComparisonController } from "./performance-comparison/performance-comparison.controller.js";
import { PerformanceComparisonService } from "./performance-comparison/performance-comparison.service.js";
import { PERFORMANCE_STORE } from "./performance-comparison/performance-comparison.types.js";
import { PgPerformanceComparisonStore } from "./performance-comparison/pg-performance-comparison.store.js";
import { FinancialStatementController } from "./financial-statements/financial-statement.controller.js";
import { FinancialStatementService } from "./financial-statements/financial-statement.service.js";
import { FINANCIAL_STATEMENT_STORE } from "./financial-statements/financial-statement.types.js";
import { PgFinancialStatementStore } from "./financial-statements/pg-financial-statement.store.js";
import { FinancialSourceResolver } from "./financial-statements/financial-source-resolver.js";
import { ExecutiveMetricController } from "./executive-metrics/executive-metric.controller.js";
import { ExecutiveMetricService } from "./executive-metrics/executive-metric.service.js";
import { EXECUTIVE_METRIC_STORE } from "./executive-metrics/executive-metric.types.js";
import { PgExecutiveMetricStore } from "./executive-metrics/pg-executive-metric.store.js";
import { ReportExportController } from "./report-exports/report-export.controller.js";
import { ReportExportService } from "./report-exports/report-export.service.js";
import { REPORT_EXPORT_STORE } from "./report-exports/report-export.types.js";
import { PgReportExportStore } from "./report-exports/pg-report-export.store.js";
import { WorkbookImportController } from "./workbook-imports/workbook-import.controller.js";
import { WorkbookImportService } from "./workbook-imports/workbook-import.service.js";
import { OperatingDashboardController } from "./operating-dashboard/operating-dashboard.controller.js";
import { OperatingDashboardService } from "./operating-dashboard/operating-dashboard.service.js";
import { OPERATING_DASHBOARD_STORE } from "./operating-dashboard/operating-dashboard.types.js";
import { PgOperatingDashboardStore } from "./operating-dashboard/pg-operating-dashboard.store.js";

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
    ForecastComponentController,
    PerformanceComparisonController,
    FinancialStatementController,
    ExecutiveMetricController,
    ReportExportController,
    WorkbookImportController,
    OperatingDashboardController,
  ],
  providers: [
    DatabaseReadinessService,
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
    ForecastComponentService,
    PgForecastComponentStore,
    { provide: FORECAST_COMPONENT_STORE, useExisting: PgForecastComponentStore },
    PerformanceComparisonService,
    PgPerformanceComparisonStore,
    { provide: PERFORMANCE_STORE, useExisting: PgPerformanceComparisonStore },
    FinancialStatementService,
    FinancialSourceResolver,
    PgFinancialStatementStore,
    { provide: FINANCIAL_STATEMENT_STORE, useExisting: PgFinancialStatementStore },
    ExecutiveMetricService,
    PgExecutiveMetricStore,
    { provide: EXECUTIVE_METRIC_STORE, useExisting: PgExecutiveMetricStore },
    ReportExportService,
    PgReportExportStore,
    { provide: REPORT_EXPORT_STORE, useExisting: PgReportExportStore },
    WorkbookImportService,
    OperatingDashboardService,
    PgOperatingDashboardStore,
    { provide: OPERATING_DASHBOARD_STORE, useExisting: PgOperatingDashboardStore },
  ],
})
export class AppModule {}
