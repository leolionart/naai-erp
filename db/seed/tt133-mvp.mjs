export const TT133_MVP_SEED_VERSION = "tt133-mvp-v1";

export async function seedTt133Mvp(client, options = {}) {
  const organizationId = String(options.organizationId ?? "org-demo").trim();
  const legalName = String(options.legalName ?? "NAAI ERP Synthetic Demo").trim();
  const fiscalYear = Number(options.fiscalYear ?? new Date().getUTCFullYear());
  if (
    !organizationId ||
    !legalName ||
    !Number.isInteger(fiscalYear) ||
    fiscalYear < 2000 ||
    fiscalYear > 9999
  )
    throw new Error("Invalid TT133 MVP seed options");

  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `tt133-mvp-seed:${organizationId}`,
    ]);
    await client.query(
      `insert into organizations(id,legal_name,base_currency,timezone)
       values($1,$2,'VND','Asia/Ho_Chi_Minh') on conflict(id) do nothing`,
      [organizationId, legalName],
    );
    await client.query(
      `insert into fiscal_years(organization_id,year,starts_on,ends_on)
       values($1,$2,make_date($2,1,1),make_date($2,12,31)) on conflict do nothing`,
      [organizationId, fiscalYear],
    );
    await client.query(
      `insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state)
       select $1,$2,month,make_date($2,month,1),(make_date($2,month,1)+interval '1 month'-interval '1 day')::date,'open'
       from generate_series(1,12) month on conflict do nothing`,
      [organizationId, fiscalYear],
    );
    await client.query(
      `insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting)
       select $1,code,name,root_type::account_root_type,is_control,not is_control from (values
        ('111','Tiền mặt và tiền gửi','asset',false),('131','Phải thu khách hàng','asset',true),
        ('1331','Thuế GTGT được khấu trừ','asset',false),('211','Tài sản cố định','asset',false),
        ('331','Phải trả nhà cung cấp','liability',true),('3331','Thuế GTGT phải nộp','liability',false),
        ('341','Vay và nợ thuê tài chính','liability',false),('411','Vốn đầu tư của chủ sở hữu','equity',false),
        ('421','Lợi nhuận sau thuế chưa phân phối','equity',false),('511','Doanh thu cung cấp dịch vụ','revenue',false),
        ('632','Giá vốn dịch vụ','expense',false),('642','Chi phí quản lý doanh nghiệp','expense',false),
        ('711','Thu nhập khác','revenue',false),('811','Chi phí khác','expense',false),
        ('821','Chi phí thuế thu nhập doanh nghiệp','expense',false)
       ) a(code,name,root_type,is_control) on conflict do nothing`,
      [organizationId],
    );
    await client.query(
      `insert into statutory_account_mappings(organization_id,account_code,framework,statutory_code,effective_from,approved_by,approved_at)
       select $1,code,'TT133',code,make_date($2,1,1),'synthetic-seed',now()
       from accounts where organization_id=$1 on conflict do nothing`,
      [organizationId, fiscalYear],
    );
    await client.query(
      `insert into financial_accounts
       (organization_id,id,code,kind,display_name,currency,ledger_account_code,status,created_by,updated_by)
       values($1,'mvp-cash','CASH','cash','Tiền và tương đương tiền','VND','111','active','synthetic-seed','synthetic-seed')
       on conflict do nothing`,
      [organizationId],
    );
    await client.query(
      `insert into tax_code_versions(organization_id,code,name,kind,rate,effective_from,review_state,required_evidence,reviewed_by,reviewed_at,review_reason)
       select $1,code,name,kind::tax_kind,rate,make_date($2,1,1),'accountant_approved','[]'::jsonb,'synthetic-seed',now(),'Synthetic TT133 MVP default'
       from (values ('VAT10_IN','VAT đầu vào 10%','vat_input',0.10),('VAT10_OUT','VAT đầu ra 10%','vat_output',0.10),
                    ('VAT0_IN','VAT đầu vào 0%','vat_input',0.00),('VAT0_OUT','VAT đầu ra 0%','vat_output',0.00)) t(code,name,kind,rate)
       on conflict do nothing`,
      [organizationId, fiscalYear],
    );
    await client.query(
      `insert into dimension_values(organization_id,kind,code,name,is_active) values
       ($1,'cost_center','GENERAL','Vận hành chung',true),($1,'service_line','WEB_APP','Thiết kế và phát triển web app',true),
       ($1,'category','SALES_SERVICE','Doanh thu dịch vụ',true),($1,'category','PURCHASE_OPERATING','Mua hàng và vận hành',true),
       ($1,'category','EXPENSE_NON_DOCUMENTED','Chi phí không hóa đơn',true),($1,'category','BANK_FEE','Phí ngân hàng',true)
       on conflict do nothing`,
      [organizationId],
    );
    await client.query(
      `insert into default_mapping_versions(organization_id,category_code,account_code,tax_code,tax_effective_from,default_cost_center_code,default_service_line_code,effective_from,change_reason,correlation_id,created_by)
       select $1,category,account,tax,case when tax is null then null else make_date($2,1,1) end,'GENERAL','WEB_APP',make_date($2,1,1),'Synthetic TT133 MVP default','synthetic-seed','synthetic-seed'
       from (values ('SALES_SERVICE','511','VAT10_OUT'),('PURCHASE_OPERATING','642','VAT10_IN'),
                    ('EXPENSE_NON_DOCUMENTED','642',null),('BANK_FEE','642',null)) m(category,account,tax)
       on conflict do nothing`,
      [organizationId, fiscalYear],
    );
    await client.query(
      `insert into financial_statement_mapping_versions
       (organization_id,id,version,framework,state,effective_from,change_reason,report_policy,created_by,approved_by,approved_at)
       values($1,$3,1,'TT133','approved',make_date($2,1,1),'Synthetic TT133 MVP statement mapping',
       '{"maxLedgerDifferenceMinor":"0","maxUnreviewedInputMinor":"0","maxUnresolvedItemCount":0,"maxMissingEvidenceCount":0}',
       'synthetic-seed','synthetic-seed',now()) on conflict do nothing`,
      [organizationId, fiscalYear, TT133_MVP_SEED_VERSION],
    );
    const mappingLines = [
      ["profit_and_loss", "revenue", "Doanh thu", "511", 10, 1, null, null],
      ["profit_and_loss", "direct_cost", "Giá vốn", "632", 20, 1, null, null],
      ["profit_and_loss", "opex", "Chi phí quản lý", "642", 30, 1, null, null],
      ["profit_and_loss", "other_income", "Thu nhập khác", "711", 40, 1, null, null],
      ["profit_and_loss", "other_expense", "Chi phí khác", "811", 50, 1, null, null],
      ["profit_and_loss", "tax_expense", "Thuế TNDN", "821", 60, 1, null, null],
      ["balance_sheet", "cash", "Tiền", "111", 10, 1, null, null],
      ["balance_sheet", "receivables", "Phải thu", "131", 20, 1, null, null],
      ["balance_sheet", "input_vat", "VAT được khấu trừ", "1331", 30, 1, null, null],
      ["balance_sheet", "fixed_assets", "Tài sản cố định", "211", 40, 1, null, null],
      ["balance_sheet", "payables", "Phải trả", "331", 50, 1, null, null],
      ["balance_sheet", "output_vat", "VAT phải nộp", "3331", 60, 1, null, null],
      ["balance_sheet", "loans", "Vay", "341", 70, 1, null, null],
      ["balance_sheet", "capital", "Vốn chủ sở hữu", "411", 80, 1, null, null],
      ["balance_sheet", "retained_earnings", "Lợi nhuận giữ lại", "421", 90, 1, null, null],
      ["cash_flow", "operating", "Lưu chuyển kinh doanh", "511", 10, 1, "operating", null],
      ["cash_flow", "operating", "Lưu chuyển kinh doanh", "632", 20, 1, "operating", null],
      ["cash_flow", "operating", "Lưu chuyển kinh doanh", "642", 30, 1, "operating", null],
      ["cash_flow", "operating", "Lưu chuyển kinh doanh", "711", 40, 1, "operating", null],
      ["cash_flow", "operating", "Lưu chuyển kinh doanh", "811", 50, 1, "operating", null],
      ["cash_flow", "operating", "Lưu chuyển kinh doanh", "821", 60, 1, "operating", null],
      ["cash_flow", "investing", "Lưu chuyển đầu tư", "211", 70, 1, "investing", null],
      ["cash_flow", "financing", "Lưu chuyển tài chính", "341", 80, 1, "financing", null],
      ["cash_flow", "financing", "Lưu chuyển tài chính", "411", 90, 1, "financing", null],
      ["vat_reconciliation", "output_vat", "VAT đầu ra", "3331", 10, 1, null, "output"],
      ["vat_reconciliation", "input_vat", "VAT đầu vào", "1331", 20, 1, null, "input_eligible"],
    ];
    for (const [index, line] of mappingLines.entries())
      await client.query(
        `insert into financial_statement_mapping_lines
         (organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign,cash_flow_class,vat_treatment)
         values($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing`,
        [organizationId, TT133_MVP_SEED_VERSION, index + 1, ...line],
      );
    await client.query("commit");
    return { organizationId, fiscalYear, mappingId: TT133_MVP_SEED_VERSION, synthetic: true };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
