import { createHash } from "node:crypto";
import type pg from "pg";

export const authHeaders = (token: string, key?: string) => ({
  authorization: `Bearer ${token}`,
  ...(key ? { "idempotency-key": key } : {}),
});

export async function seedOwnerCustodyBaseOrg(pool: pg.Pool, orgId: string, token: string) {
  await pool.query(
    `insert into organizations(id,legal_name,base_currency,timezone) values($1,$2,'VND','Asia/Ho_Chi_Minh')`,
    [orgId, `Org ${orgId}`],
  );
  await pool.query(
    `insert into accounting_workflow_policies(organization_id,allow_self_approval,self_approval_max_minor,operating_mode,updated_by)
     values($1,false,null,'solopreneur','owner-1')`,
    [orgId],
  );
  await pool.query(
    `insert into fiscal_years(organization_id,year,starts_on,ends_on) values($1,2026,'2026-01-01','2026-12-31')`,
    [orgId],
  );
  await pool.query(
    `insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state) values
       ($1,2026,8,'2026-08-01','2026-08-31','open'),
       ($1,2026,9,'2026-09-01','2026-09-30','hard_locked')`,
    [orgId],
  );
  await pool.query(
    `insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
       ($1,'112-BANK','Tien gui ngan hang','asset',false,true),
       ($1,'113-TRANSIT','Tien dang chuyen','asset',false,true),
       ($1,'131-AR','Phai thu KH','asset',true,false),
       ($1,'1331-VAT','VAT dau vao','asset',false,true),
       ($1,'331-AP','Phai tra NCC','liability',true,false),
       ($1,'3331-VAT','VAT dau ra','liability',false,true),
       ($1,'3388-OWNER','Phai tra chu','liability',false,true),
       ($1,'411-CAPITAL','Von gop','equity',false,true),
       ($1,'511-REV','Doanh thu','revenue',false,true),
       ($1,'642-OPEX','Chi phi QLDN','expense',false,true)`,
    [orgId],
  );
  await pool.query(
    `insert into tax_code_versions(organization_id,code,name,kind,rate,effective_from,review_state,reviewed_by,reviewed_at,review_reason) values
       ($1,'VAT10_IN','VAT 10%','vat_input',0.10,'2026-01-01','accountant_approved','owner-1',now(),'seed'),
       ($1,'CIT20','CIT 20%','cit',0.20,'2026-01-01','accountant_approved','owner-1',now(),'seed')`,
    [orgId],
  );
  await pool.query(
    `insert into expense_categories(organization_id,code,name,funding_treatment,created_by,updated_by) values
       ($1,'OFFICE','Van phong pham','company_funds','owner-1','owner-1'),
       ($1,'OWNER_ADV','Chu chi ho','owner_paid_company_cost','owner-1','owner-1')`,
    [orgId],
  );
  await pool.query(
    `insert into parties(organization_id,id,display_name,status) values
       ($1,'SUP-1','Nha cung cap A','active'),
       ($1,'CLI-1','Khach hang B','active')`,
    [orgId],
  );
  await pool.query(
    `insert into party_roles(organization_id,party_id,role) values
       ($1,'SUP-1','supplier'),
       ($1,'CLI-1','client')`,
    [orgId],
  );
  await pool.query(
    `insert into financial_statement_mapping_versions(organization_id,id,version,framework,state,effective_from,change_reason,created_by,approved_by,approved_at) values
       ($1,'map-tt133',1,'TT133','approved','2026-01-01','Seed TT133','owner-1','owner-1',now())`,
    [orgId],
  );
  await pool.query(
    `insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign,vat_treatment) values
       ($1,'map-tt133',1,1,'profit_and_loss','revenue','Doanh thu','511-REV',10,1,null),
       ($1,'map-tt133',1,2,'profit_and_loss','opex','Chi phi QLDN','642-OPEX',20,1,null),
       ($1,'map-tt133',1,3,'balance_sheet','cash','Tien ngan hang','112-BANK',10,1,null),
       ($1,'map-tt133',1,4,'balance_sheet','input_vat','VAT dau vao','1331-VAT',30,1,null),
       ($1,'map-tt133',1,5,'balance_sheet','owner_current','Vang lai chu','3388-OWNER',70,1,null),
       ($1,'map-tt133',1,6,'balance_sheet','capital','Von chu so huu','411-CAPITAL',80,1,null),
       ($1,'map-tt133',1,7,'vat_reconciliation','input_vat','VAT dau vao','1331-VAT',10,1,'input_eligible'),
       ($1,'map-tt133',1,8,'vat_reconciliation','output_vat','VAT dau ra','3331-VAT',20,1,'output')`,
    [orgId],
  );
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'cred-owner','owner-1',$2,'["owner"]')`,
    [orgId, tokenHash],
  );
}

export async function applyMigration0076(pool: pg.Pool, orgId: string) {
  await pool.query(
    `INSERT INTO accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
     VALUES
       ($1, '111', 'Tiền mặt', 'asset', false, true, true),
       ($1, '111-CASH', 'Quỹ tiền mặt công ty', 'asset', false, true, true),
       ($1, '111-OWNER-CUSTODY', 'Quỹ tiền mặt do chủ giữ', 'asset', false, true, true),
       ($1, '1388', 'Phải thu khác', 'asset', false, true, true),
       ($1, '1388-OWNER', 'Phải thu chủ sở hữu', 'asset', false, true, true)
     ON CONFLICT (organization_id, code) DO NOTHING`,
    [orgId],
  );
  await pool.query(
    `INSERT INTO account_hierarchy_edges (organization_id, child_code, child_root_type, parent_code, parent_root_type)
     VALUES
       ($1, '111-CASH', 'asset', '111', 'asset'),
       ($1, '111-OWNER-CUSTODY', 'asset', '111', 'asset'),
       ($1, '1388-OWNER', 'asset', '1388', 'asset')
     ON CONFLICT (organization_id, child_code) DO NOTHING`,
    [orgId],
  );
  await pool.query(
    `INSERT INTO financial_statement_mapping_lines
       (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
     VALUES
       ($1, 'map-tt133', 1, 21, 'balance_sheet', 'cash', 'Quỹ tiền mặt do chủ giữ', '111-OWNER-CUSTODY', 12, 1),
       ($1, 'map-tt133', 1, 22, 'balance_sheet', 'owner_receivable', 'Phải thu chủ sở hữu', '1388', 25, 1),
       ($1, 'map-tt133', 1, 23, 'balance_sheet', 'owner_receivable', 'Phải thu chủ sở hữu', '1388-OWNER', 26, 1)
     ON CONFLICT DO NOTHING`,
    [orgId],
  );
}
