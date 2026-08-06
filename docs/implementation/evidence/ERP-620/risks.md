# ERP-620 risks and follow-up

- A percentage without a labeled comparator is misleading. API/UI must disclose whether the denominator is prorated target, full target, prior period, prior year or retained forecast.
- Recognized, invoiced and collected actuals are distinct axes. Changing the selected basis can materially change attainment and must remain visible in every output and drill-down.
- A collected receipt may settle an invoice allocated across multiple dimensions. The current safe policy attributes collection dimensions only when all invoice allocations share the same dimension object; mixed allocations remain `{}` and therefore do not appear in dimension-filtered reports. A future split-allocation policy needs an explicit reviewed cash-allocation model rather than proportional guessing.
- Performance reads depend on refreshed `planning_actual_facts`. If eligible source rows are newer than the latest materialization, the API fails with a stale-facts error instead of serving an outdated comparison. Each fact must also still match the source's eligible state and captured version at read time.
- Calendar and fiscal periods can overlap. Reports must resolve explicit period IDs/date ranges rather than infer a month by subtracting a fixed number of days.
- Timezone conversion occurs before local-date inclusion. UTC-midnight logic would misclassify the Ho Chi Minh City month boundary tested by the fixture.
- Leap-day YoY comparison needs a reviewed clamp policy. Rolling February 29 into March 1 would compare unlike periods.
- Missing comparison and zero denominator are different controls. Both yield null percentages, but zero preserves a valid amount variance while missing data does not.
- MTD day proration is a simple planning convention, not a seasonality model. Future weighted-working-day or milestone target curves require a new labeled formula version.
- Real workbook tab/column shapes were not inspected in the fixture-planning subtask because the required artifact-tool runtime was unavailable. Import mapping must be verified separately before loading customer data.
- Fixture data is anonymized and must remain free of customer-identifying financial records.
- Local non-PostgreSQL, fixture, build and 41/41 Playwright proof is green. Exact-commit PostgreSQL integration also passed for `bb048f4d291cacaedbc32fb132665b5901b43bbd` in GitHub Actions run `31060887883`; no ERP-620 acceptance boundary remains open.
