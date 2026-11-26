-- Seed for verifying the real web UI against the real API on a scratch Postgres (see README.md).
-- Apply to a database migrated with `pnpm --filter @naai-erp/database db:migrate`.
-- Tokens (plain text) used by the scripts: owner = ui-owner-token, integration (n8n) = ui-int-token.
insert into organizations(id,legal_name,base_currency,timezone) values('org-ui','UI Verify Co','VND','Asia/Ho_Chi_Minh');
insert into fiscal_years(organization_id,year,starts_on,ends_on) values('org-ui',2026,'2026-01-01','2026-12-31');
insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on)
  select 'org-ui',2026,n,make_date(2026,n,1),(make_date(2026,n,1)+interval '1 month - 1 day')::date from generate_series(1,12) n;
insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
 ('org-ui','111-CASH','Cash','asset',false,true),('org-ui','112-BANK','Bank','asset',false,true),
 ('org-ui','131-AR','AR','asset',true,false),('org-ui','331-AP','AP','liability',true,false),
 ('org-ui','3388-OWNER','Owner current','liability',false,true),('org-ui','511-REV','Revenue','revenue',false,true),
 ('org-ui','3331-VAT-OUT','VAT out','liability',true,false),('org-ui','642-OPEX','Opex','expense',false,true),
 ('org-ui','632-COST','Cost','expense',false,true),('org-ui','1331-VAT','VAT in','asset',true,false);
insert into financial_statement_mapping_versions(organization_id,id,version,framework,state,effective_from,change_reason,created_by,approved_by,approved_at)
 values('org-ui','map',1,'TT133','approved','2026-01-01','seed','seed','seed',now());
insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign)
 values('org-ui','map',1,1,'balance_sheet','owner_current','Owner current','3388-OWNER',10,1);
insert into parties(organization_id,id,display_name,status) values('org-ui','CLIENT','Khách hàng A','active'),('org-ui','SUP','Nhà cung cấp B','active');
insert into party_roles(organization_id,party_id,role) values('org-ui','CLIENT','client'),('org-ui','SUP','supplier');
insert into users(id,email,display_name) values('ui-owner','ui-owner@example.com','UI Owner');
insert into organization_memberships(organization_id,user_id) values('org-ui','ui-owner');
insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
 values('org-ui','PRJ','PRJ','Dự án A','CLIENT','ui-owner','fixed_fee','VND',100000000,'2026-01-01','active');
insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency) values('org-ui','CON','PRJ','CON','2026-01-01',100000000,'VND');
insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,created_by,updated_by) values
 ('org-ui','fa-company','CASH-COMPANY','cash','Quỹ tiền mặt công ty','VND','111-CASH','s','s'),
 ('org-ui','fa-custody','CASH-OWNER-CUSTODY','cash','Tiền công ty chủ giữ hộ','VND','111-CASH','s','s');
-- Only the canonical catalogs on purpose (no legacy dimension_values): this is what a real organization has.
insert into business_categories(organization_id,kind,code,name,is_active) values
 ('org-ui','expense','OFFICE','Văn phòng',true),('org-ui','revenue','SERVICE','Dịch vụ',true);
insert into expense_categories(organization_id,code,name,funding_treatment,created_by,updated_by)
 values('org-ui','OFFICE','Văn phòng','company_funds','s','s');
insert into accounting_workflow_policies(organization_id,allow_self_approval,self_approval_max_minor,operating_mode,updated_by) values('org-ui',false,null,'solopreneur','seed');
-- sha256('ui-owner-token') / sha256('ui-int-token')
insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values
 ('org-ui','c-owner','ui-owner',encode(sha256('ui-owner-token'),'hex'),'["owner"]'),
 ('org-ui','c-int','n8n-bot',encode(sha256('ui-int-token'),'hex'),'["integration"]');
