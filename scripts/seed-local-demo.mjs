import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const verifyOnly = args.has("--verify");
const envFile = new URL("../apps/web/.env.local", import.meta.url);

async function localEnv() {
  try {
    return Object.fromEntries(
      (await readFile(envFile, "utf8"))
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = await localEnv();
const baseUrl = (
  process.env.NAAI_ERP_BASE_URL ??
  fileEnv.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001"
).replace(/\/$/, "");
const organizationId =
  process.env.NAAI_ERP_ORGANIZATION ?? fileEnv.NEXT_PUBLIC_ORGANIZATION_ID ?? "naai";
const makerToken = process.env.NAAI_ERP_TOKEN ?? fileEnv.NEXT_PUBLIC_API_TOKEN;
let checkerToken = process.env.NAAI_ERP_CHECKER_TOKEN;
if (!makerToken) throw new Error("NAAI_ERP_TOKEN or NEXT_PUBLIC_API_TOKEN is required");

async function bootstrapLocalChecker() {
  if (checkerToken && !args.has("--bootstrap-checker")) return;
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://naai_erp:naai_erp@localhost:5432/naai_erp";
  const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
  const pg = apiRequire("pg");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  checkerToken = randomBytes(32).toString("base64url");
  try {
    await client.query("begin");
    await client.query(
      `insert into users(id,email,display_name) values($1,$2,$3)
       on conflict(id) do update set display_name=excluded.display_name`,
      ["local-demo-checker", "local-demo-checker@example.invalid", "Local Demo Checker"],
    );
    await client.query(
      `insert into organization_memberships(organization_id,user_id) values($1,$2)
       on conflict do nothing`,
      [organizationId, "local-demo-checker"],
    );
    for (const role of ["approver", "accountant"]) {
      await client.query(
        `insert into membership_roles(organization_id,user_id,role) values($1,$2,$3)
         on conflict do nothing`,
        [organizationId, "local-demo-checker", role],
      );
    }
    await client.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles,status)
       values($1,$2,$3,$4,$5,'active')
       on conflict(organization_id,id) do update set actor_id=excluded.actor_id,
         token_hash=excluded.token_hash,roles=excluded.roles,status='active'`,
      [
        organizationId,
        "local-demo-checker-credential",
        "local-demo-checker",
        createHash("sha256").update(checkerToken).digest("hex"),
        JSON.stringify(["approver", "accountant"]),
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (!verifyOnly) await bootstrapLocalChecker();

const api = `${baseUrl}/api/v1/organizations/${encodeURIComponent(organizationId)}`;
const results = [];
const note = (stage, detail) => {
  results.push({ stage, detail });
  process.stdout.write(`${stage}: ${detail}\n`);
};

async function request(path, { method = "GET", body, token = makerToken, key } = {}) {
  const response = await fetch(path.startsWith("http") ? path : `${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": `demo-v1:${key}` } : {}),
      "x-correlation-id": "naai-local-demo-v1",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json")
    ? await response.json()
    : await response.arrayBuffer();
  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function createMaster(resource, data, key) {
  return request(`/master-data/${resource}`, {
    method: "POST",
    body: { data },
    key: `master:${key}`,
  });
}

async function getOrNull(path) {
  try {
    return await request(path);
  } catch (error) {
    if (String(error.message).endsWith("-> 404")) return null;
    throw error;
  }
}

async function ensureAction(resourcePath, id, action, allowedStates, token = makerToken) {
  const current = await request(`${resourcePath}/${id}`);
  const state = current.data?.state ?? current.data?.resource?.state;
  if (!allowedStates.includes(state)) return current;
  return request(`${resourcePath}/${id}/${action}`, {
    method: "POST",
    body: { reason: `NAAI local demo: ${action}` },
    token,
    key: `${id}:${action}`,
  });
}

const year = 2026;
const startsOn = "2026-01-01";
const endsOn = "2026-12-31";
const asOfInstant = "2026-12-31T16:59:59.000Z";

const accounts = [
  ["111-CASH", "Tiền mặt", "asset", false, true],
  ["112-BANK", "Tiền gửi ngân hàng", "asset", false, true],
  ["113-TRANSIT", "Tiền đang chuyển", "asset", false, true],
  ["131-AR", "Phải thu khách hàng", "asset", true, false],
  ["1368-CONTRACT", "Tài sản hợp đồng chưa xuất hóa đơn", "asset", false, true],
  ["1331-VAT", "Thuế GTGT được khấu trừ", "asset", false, true],
  ["211-EQUIP", "Tài sản cố định", "asset", false, true],
  ["331-AP", "Phải trả nhà cung cấp", "liability", true, false],
  ["3331-VAT", "Thuế GTGT phải nộp", "liability", false, true],
  ["3387-DEFERRED", "Doanh thu chưa thực hiện", "liability", false, true],
  ["3388-OWNER", "Tài khoản vãng lai chủ doanh nghiệp", "liability", false, true],
  ["341-LOAN", "Vay chủ doanh nghiệp", "liability", false, true],
  ["411-CAPITAL", "Vốn chủ sở hữu", "equity", false, true],
  ["421-RE", "Lợi nhuận chưa phân phối", "equity", false, true],
  ["511-REV", "Doanh thu dịch vụ", "revenue", false, true],
  ["515-OTHER", "Thu nhập khác", "revenue", false, true],
  ["632-COGS", "Giá vốn dịch vụ", "expense", false, true],
  ["635-OTHER", "Chi phí khác", "expense", false, true],
  ["642-OPEX", "Chi phí quản lý", "expense", false, true],
  ["821-TAX", "Chi phí thuế TNDN", "expense", false, true],
];

const mappingLines = [
  ["profit_and_loss", "revenue", "Doanh thu", "511-REV", 10],
  ["profit_and_loss", "direct_cost", "Giá vốn", "632-COGS", 20],
  ["profit_and_loss", "opex", "Chi phí quản lý", "642-OPEX", 30],
  ["profit_and_loss", "other_income", "Thu nhập khác", "515-OTHER", 40],
  ["profit_and_loss", "other_expense", "Chi phí khác", "635-OTHER", 50],
  ["profit_and_loss", "tax_expense", "Thuế TNDN", "821-TAX", 60],
  ["balance_sheet", "cash", "Tiền mặt", "111-CASH", 10],
  ["balance_sheet", "cash", "Tiền gửi", "112-BANK", 11],
  ["balance_sheet", "receivables", "Phải thu", "131-AR", 20],
  ["balance_sheet", "contract_assets", "Tài sản hợp đồng", "1368-CONTRACT", 21],
  ["balance_sheet", "input_vat", "VAT đầu vào", "1331-VAT", 30],
  ["balance_sheet", "equipment", "Tài sản cố định", "211-EQUIP", 40],
  ["balance_sheet", "payables", "Phải trả", "331-AP", 50],
  ["balance_sheet", "output_vat", "VAT đầu ra", "3331-VAT", 60],
  ["balance_sheet", "owner_current", "Vãng lai chủ doanh nghiệp", "3388-OWNER", 70],
  ["balance_sheet", "owner_loan", "Vay chủ doanh nghiệp", "341-LOAN", 71],
  ["balance_sheet", "capital", "Vốn chủ sở hữu", "411-CAPITAL", 80],
  ["balance_sheet", "retained_earnings", "Lợi nhuận giữ lại", "421-RE", 90],
  ["cash_flow", "operating", "Kinh doanh", "511-REV", 10, "operating"],
  ["cash_flow", "operating", "Kinh doanh", "632-COGS", 20, "operating"],
  ["cash_flow", "operating", "Kinh doanh", "642-OPEX", 30, "operating"],
  ["cash_flow", "investing", "Đầu tư", "211-EQUIP", 40, "investing"],
  ["cash_flow", "financing", "Tài chính", "3388-OWNER", 50, "financing"],
  ["cash_flow", "financing", "Tài chính", "341-LOAN", 51, "financing"],
  ["cash_flow", "financing", "Tài chính", "411-CAPITAL", 52, "financing"],
  ["vat_reconciliation", "output_vat", "VAT đầu ra", "3331-VAT", 10, null, "output"],
  ["vat_reconciliation", "input_vat", "VAT đầu vào", "1331-VAT", 20, null, "input_eligible"],
].map(([statement, lineCode, label, accountCode, displayOrder, cashFlowClass, vatTreatment]) => ({
  statement,
  lineCode,
  label,
  accountCode,
  displayOrder,
  ...(cashFlowClass ? { cashFlowClass } : {}),
  ...(vatTreatment ? { vatTreatment } : {}),
}));

async function seedMasterData() {
  await createMaster("fiscal-years", { year, starts_on: startsOn, ends_on: endsOn }, "fy-2026");
  for (let month = 1; month <= 12; month += 1) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    await createMaster(
      "fiscal-periods",
      {
        fiscal_year: year,
        period_number: month,
        starts_on: start.toISOString().slice(0, 10),
        ends_on: end.toISOString().slice(0, 10),
      },
      `period-${month}`,
    );
  }
  for (const [code, name, root_type, is_control_account, allow_manual_posting] of accounts)
    await createMaster(
      "accounts",
      { code, name, root_type, is_control_account, allow_manual_posting, is_active: true },
      `account-${code}`,
    );
  for (const [code, name, kind, rate] of [
    ["VAT10_OUT", "VAT đầu ra 10%", "vat_output", "0.10"],
    ["VAT10_IN", "VAT đầu vào 10%", "vat_input", "0.10"],
    ["CIT20", "Thuế thu nhập doanh nghiệp 20%", "cit", "0.20"],
  ])
    await createMaster(
      "tax-code-versions",
      {
        code,
        name,
        kind,
        rate,
        effective_from: startsOn,
        review_state: "accountant_approved",
        required_evidence: [],
        reviewed_by: "local-demo",
        reviewed_at: "2026-01-01T00:00:00.000Z",
        review_reason: "Synthetic local demo",
      },
      `tax-${code}`,
    );
  for (const [kind, code, name] of [
    ["cost_center", "GENERAL", "Vận hành chung"],
    ["service_line", "WEB", "Thiết kế và phát triển web"],
    ["category", "DEMO", "Dữ liệu demo"],
  ])
    await createMaster(
      "dimensions",
      { kind, code, name, is_active: true },
      `dimension-${kind}-${code}`,
    );
  for (const party of [
    {
      id: "demo-client-a",
      display_name: "Công ty Khách hàng An Phát",
      normalized_tax_id: "0310000001",
      status: "active",
    },
    {
      id: "demo-client-b",
      display_name: "Công ty Khách hàng Bình Minh",
      normalized_tax_id: "0310000002",
      status: "active",
    },
    {
      id: "demo-supplier-a",
      display_name: "Nhà cung cấp Minh Long",
      normalized_tax_id: "0310000003",
      status: "active",
    },
    { id: "demo-freelancer-ui", display_name: "Freelancer Nguyễn Minh Anh", status: "active" },
    { id: "demo-dev-contractor", display_name: "Dev Backend Trần Quốc Huy", status: "active" },
    { id: "demo-owner", display_name: "Chủ doanh nghiệp NAAI", status: "active" },
  ])
    await createMaster("parties", party, `party-${party.id}`);
  for (const [party_id, role] of [
    ["demo-client-a", "client"],
    ["demo-client-b", "client"],
    ["demo-supplier-a", "supplier"],
    ["demo-freelancer-ui", "freelancer"],
    ["demo-dev-contractor", "freelancer"],
    ["demo-owner", "employee"],
  ])
    await createMaster("party-roles", { party_id, role }, `role-${party_id}-${role}`);
  for (const project of [
    {
      id: "demo-project-web",
      code: "DEMO-WEB",
      name: "Website An Phát",
      client_party_id: "demo-client-a",
      owner_user_id: "local-owner-actor",
      contract_type: "fixed_fee",
      currency: "VND",
      budget_minor: "180000000",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      state: "active",
    },
    {
      id: "demo-project-ai",
      code: "DEMO-AI",
      name: "Trợ lý AI Bình Minh",
      client_party_id: "demo-client-b",
      owner_user_id: "local-owner-actor",
      contract_type: "time_and_materials",
      currency: "VND",
      budget_minor: "120000000",
      starts_on: "2026-03-01",
      ends_on: "2026-12-31",
      state: "active",
    },
  ])
    await createMaster("projects", project, `project-${project.id}`);
  for (const contract of [
    {
      id: "demo-contract-web",
      project_id: "demo-project-web",
      reference: "NAAI-CTR-WEB-2026",
      signed_on: "2026-01-05",
      value_minor: "180000000",
      currency: "VND",
    },
    {
      id: "demo-contract-ai",
      project_id: "demo-project-ai",
      reference: "NAAI-CTR-AI-2026",
      signed_on: "2026-03-05",
      value_minor: "120000000",
      currency: "VND",
    },
  ])
    await createMaster("contracts", contract, `contract-${contract.id}`);
  for (const milestone of [
    {
      id: "demo-milestone-web-design",
      contract_id: "demo-contract-web",
      name: "Nghiệm thu thiết kế và nền tảng website",
      due_on: "2026-07-25",
      amount_minor: "80000000",
      sequence: 1,
    },
    {
      id: "demo-milestone-web-launch",
      contract_id: "demo-contract-web",
      name: "Nghiệm thu triển khai chính thức",
      due_on: "2026-10-15",
      amount_minor: "100000000",
      sequence: 2,
    },
    {
      id: "demo-milestone-ai-pilot",
      contract_id: "demo-contract-ai",
      name: "Nghiệm thu bản pilot trợ lý AI",
      due_on: "2026-08-05",
      amount_minor: "50000000",
      sequence: 1,
    },
    {
      id: "demo-milestone-ai-rollout",
      contract_id: "demo-contract-ai",
      name: "Nghiệm thu triển khai toàn bộ",
      due_on: "2026-11-30",
      amount_minor: "70000000",
      sequence: 2,
    },
  ])
    await createMaster("milestones", milestone, `milestone-${milestone.id}`);
  await createMaster(
    "accounting-workflow-policy",
    {
      allow_self_approval: false,
      self_approval_max_minor: null,
      soft_lock_posting_roles: JSON.stringify(["owner", "finance_admin"]),
      updated_by: "local-demo",
    },
    "workflow-policy",
  );
  note("master-data", "fiscal setup, accounts, tax, dimensions, parties and projects ready");
}

async function ensureVersionedAction(resource, id, action, allowedStates, token = makerToken) {
  const current = await request(`/${resource}/${id}`);
  const item = current.data?.resource ?? current.data;
  if (!allowedStates.includes(item.state)) return current;
  return request(`/${resource}/${id}/${action}`, {
    method: "POST",
    body: {
      schemaVersion: 1,
      expectedResourceVersion: String(item.resourceVersion),
      reason: `NAAI local demo: ${action}`,
    },
    token,
    key: `${id}:${action}`,
  });
}

async function seedProjectEconomics() {
  for (const budget of [
    {
      id: "demo-budget-web-v1",
      projectId: "demo-project-web",
      versionNumber: 1,
      kind: "baseline",
      currency: "VND",
      effectiveOn: "2026-01-05",
      lines: [
        {
          id: "web-revenue",
          category: "revenue",
          amountMinor: "180000000",
          note: "Giá trị hợp đồng",
        },
        {
          id: "web-vendor",
          category: "vendor",
          amountMinor: "45000000",
          note: "Mua ngoài trực tiếp",
        },
        { id: "web-labor", category: "labor", amountMinor: "35000000", note: "Nhân công dự án" },
        {
          id: "web-overhead",
          category: "overhead",
          amountMinor: "15000000",
          note: "Chi phí chung phân bổ",
        },
      ],
      reason: "Ngân sách cơ sở dự án website",
    },
    {
      id: "demo-budget-ai-v1",
      projectId: "demo-project-ai",
      versionNumber: 1,
      kind: "baseline",
      currency: "VND",
      effectiveOn: "2026-03-05",
      lines: [
        {
          id: "ai-revenue",
          category: "revenue",
          amountMinor: "120000000",
          note: "Giá trị hợp đồng",
        },
        {
          id: "ai-vendor",
          category: "vendor",
          amountMinor: "25000000",
          note: "Hạ tầng và dịch vụ ngoài",
        },
        { id: "ai-labor", category: "labor", amountMinor: "30000000", note: "Nhân công dự án" },
        {
          id: "ai-overhead",
          category: "overhead",
          amountMinor: "12000000",
          note: "Chi phí chung phân bổ",
        },
      ],
      reason: "Ngân sách cơ sở dự án trợ lý AI",
    },
  ]) {
    if (!(await getOrNull(`/project-budgets/${budget.id}`)))
      await request("/project-budgets", {
        method: "POST",
        body: { schemaVersion: 1, ...budget },
        key: `${budget.id}:create`,
      });
    await ensureVersionedAction("project-budgets", budget.id, "submit", ["draft"], makerToken);
    await ensureVersionedAction(
      "project-budgets",
      budget.id,
      "approve",
      ["submitted"],
      checkerToken,
    );
  }

  const evidenceId = "demo-evidence-web-acceptance";
  if (!(await getOrNull(`/evidence/${evidenceId}`)))
    await request("/evidence", {
      method: "POST",
      body: {
        evidenceId,
        subjectType: "milestone",
        subjectId: "demo-milestone-web-design",
        evidenceType: "client_acceptance",
        originalFilename: "demo-nghiem-thu-website.pdf",
        declaredMediaType: "application/pdf",
        contentBase64: Buffer.from("%PDF-1.7\nSynthetic local demo acceptance evidence").toString(
          "base64",
        ),
        source: "local-demo",
      },
      key: `${evidenceId}:create`,
    });

  const policy = {
    schemaVersion: 1,
    id: "demo-recognition-policy-web",
    projectId: "demo-project-web",
    versionNumber: 1,
    method: "milestone",
    effectiveFrom: "2026-01-01",
    currency: "VND",
    contractValueMinor: "180000000",
    revenueAccountCode: "511-REV",
    contractAssetAccountCode: "131-AR",
    contractLiabilityAccountCode: "3387-DEFERRED",
    evidenceRequired: true,
    reason: "Ghi nhận doanh thu theo mốc nghiệm thu hợp đồng",
  };
  if (!(await getOrNull(`/recognition-policies/${policy.id}`)))
    await request("/recognition-policies", {
      method: "POST",
      body: policy,
      key: `${policy.id}:create`,
    });
  await ensureVersionedAction("recognition-policies", policy.id, "submit", ["draft"], makerToken);
  await ensureVersionedAction(
    "recognition-policies",
    policy.id,
    "approve",
    ["submitted"],
    checkerToken,
  );

  const acceptance = {
    schemaVersion: 1,
    id: "demo-acceptance-web-design",
    milestoneId: "demo-milestone-web-design",
    acceptedAmountMinor: "80000000",
    effectiveOn: "2026-07-25",
    evidenceIds: [evidenceId],
    reason: "Khách hàng nghiệm thu giai đoạn thiết kế và nền tảng",
  };
  if (!(await getOrNull(`/milestone-acceptances/${acceptance.id}`)))
    await request("/milestone-acceptances", {
      method: "POST",
      body: acceptance,
      key: `${acceptance.id}:create`,
    });
  await ensureVersionedAction(
    "milestone-acceptances",
    acceptance.id,
    "submit",
    ["draft"],
    makerToken,
  );
  await ensureVersionedAction(
    "milestone-acceptances",
    acceptance.id,
    "accept",
    ["submitted"],
    checkerToken,
  );

  const recognition = {
    schemaVersion: 1,
    id: "demo-recognition-web-design",
    projectId: "demo-project-web",
    policyId: policy.id,
    milestoneAcceptanceId: acceptance.id,
    effectiveOn: "2026-07-25",
    amountMinor: "80000000",
    currency: "VND",
    evidenceIds: [evidenceId],
    reason: "Ghi nhận doanh thu phần công việc đã nghiệm thu",
  };
  if (!(await getOrNull(`/revenue-recognition-events/${recognition.id}`)))
    await request("/revenue-recognition-events", {
      method: "POST",
      body: recognition,
      key: `${recognition.id}:create`,
    });
  await ensureVersionedAction(
    "revenue-recognition-events",
    recognition.id,
    "submit",
    ["draft"],
    makerToken,
  );
  await ensureVersionedAction(
    "revenue-recognition-events",
    recognition.id,
    "approve",
    ["submitted"],
    checkerToken,
  );
  await ensureVersionedAction(
    "revenue-recognition-events",
    recognition.id,
    "post",
    ["approved"],
    checkerToken,
  );
  note("project-economics", "contracts, milestones, approved budgets and posted recognition ready");
}

async function seedPolicies() {
  for (const definition of [
    { id: "demo-tt133-opening", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" },
    { id: "demo-tt133", effectiveFrom: startsOn },
  ]) {
    if (!(await getOrNull(`/financial-statement-mappings/${definition.id}`)))
      await request("/financial-statement-mappings", {
        method: "POST",
        body: {
          ...definition,
          framework: "TT133",
          changeReason: "NAAI local demo",
          lines: mappingLines,
        },
        key: `fs-map-create:${definition.id}`,
      });
    const maps = await request("/financial-statement-mappings");
    const mapping = maps.data.items.find((item) => item.id === definition.id);
    if (mapping?.state === "draft")
      await request(
        `/financial-statement-mappings/${definition.id}/versions/${mapping.version}/approve`,
        {
          method: "POST",
          body: { reason: "Approved synthetic local demo mapping" },
          token: checkerToken,
          key: `fs-map-approve:${definition.id}`,
        },
      );
  }
  const policies = await request("/executive-metric-policies");
  if (!policies.data.items.some((item) => item.id === "demo-executive-policy"))
    await request("/executive-metric-policies", {
      method: "POST",
      body: {
        id: "demo-executive-policy",
        effectiveFrom: startsOn,
        formulaVersion: "executive-metrics-v1",
        formulaPolicy: {
          averageBurnMonths: 3,
          equityConsumedDenominator: "contributed_capital",
          runwayCashSemantic: "unrestricted_cash",
          runwayFlowClass: "operating",
          signedRevenueDenominator: true,
        },
        changeReason: "NAAI local demo",
        mappings: [
          { semantic: "contributed_capital", accountCode: "411-CAPITAL" },
          { semantic: "retained_earnings", accountCode: "421-RE" },
          { semantic: "unrestricted_cash", accountCode: "112-BANK" },
          { semantic: "owner_loan", accountCode: "341-LOAN" },
        ],
      },
      key: "executive-policy-create",
    });
  const currentPolicies = await request("/executive-metric-policies");
  const policy = currentPolicies.data.items.find((item) => item.id === "demo-executive-policy");
  if (policy?.state === "draft")
    await request(
      `/executive-metric-policies/demo-executive-policy/versions/${policy.version}/approve`,
      {
        method: "POST",
        body: { reason: "Approved synthetic executive policy" },
        token: checkerToken,
        key: "executive-policy-approve",
      },
    );
  note("policies", "financial statement and executive metric policies approved");
}

async function seedJournal(id, date, description, lines) {
  let journal = await getOrNull(`/journals/${id}`);
  if (!journal) {
    await request("/journals", {
      method: "POST",
      body: { id, journalDate: date, description, currency: "VND", lines },
      key: `${id}:create`,
    });
    journal = await request(`/journals/${id}`);
  }
  if (journal.data.state === "draft")
    await request(`/journals/${id}/approve`, {
      method: "POST",
      body: { reason: "Independent local demo review" },
      token: checkerToken,
      key: `${id}:approve`,
    });
  journal = await request(`/journals/${id}`);
  if (journal.data.state === "approved")
    await request(`/journals/${id}/post`, {
      method: "POST",
      body: { reason: "Post local demo journal" },
      key: `${id}:post`,
    });
}

async function reverseJournalIfPosted(id, reversalDate, reversalJournalId, reason) {
  const journal = await getOrNull(`/journals/${id}`);
  if (journal?.data.state === "posted")
    await request(`/journals/${id}/reverse`, {
      method: "POST",
      body: { reason, reversalDate, reversalJournalId },
      key: `${id}:reverse`,
    });
}

async function seedJournals() {
  await seedJournal(
    "demo-recognition-reclass",
    "2026-07-25",
    "Phân loại riêng tài sản hợp đồng khỏi công nợ hóa đơn",
    [
      {
        accountCode: "1368-CONTRACT",
        debitMinor: "80000000",
        dimensions: {
          projectId: "demo-project-web",
          recognitionEventId: "demo-recognition-web-design",
        },
      },
      {
        accountCode: "131-AR",
        creditMinor: "80000000",
        dimensions: {
          projectId: "demo-project-web",
          recognitionEventId: "demo-recognition-web-design",
        },
      },
    ],
  );
  await seedJournal("demo-opening-capital", "2026-01-02", "Vốn ban đầu của chủ doanh nghiệp", [
    { accountCode: "112-BANK", debitMinor: "300000000", dimensions: { source: "owner" } },
    { accountCode: "411-CAPITAL", creditMinor: "300000000", dimensions: { source: "owner" } },
  ]);
  await seedJournal("demo-owner-loan", "2026-03-01", "Chủ doanh nghiệp chuyển tiền vào công ty", [
    { accountCode: "112-BANK", debitMinor: "50000000", dimensions: { partyId: "demo-owner" } },
    { accountCode: "341-LOAN", creditMinor: "50000000", dimensions: { partyId: "demo-owner" } },
  ]);
  await seedJournal("demo-equipment", "2026-04-10", "Mua thiết bị phục vụ dự án", [
    {
      accountCode: "211-EQUIP",
      debitMinor: "30000000",
      dimensions: { projectId: "demo-project-web" },
    },
    {
      accountCode: "112-BANK",
      creditMinor: "30000000",
      dimensions: { projectId: "demo-project-web" },
    },
  ]);
  await reverseJournalIfPosted(
    "demo-owner-withdrawal",
    "2026-09-16",
    "demo-owner-withdrawal-reversal",
    "Replace the earlier small withdrawal with the complete owner-current-account demo case",
  );
  await reverseJournalIfPosted(
    "demo-owner-custody-withdrawal-90m",
    "2026-09-21",
    "demo-owner-custody-withdrawal-90m-reversal",
    "Move the owner-current-account demo case into the active August dashboard cutoff",
  );
  await reverseJournalIfPosted(
    "demo-owner-paid-payroll-120m",
    "2026-09-22",
    "demo-owner-paid-payroll-120m-reversal",
    "Move the owner-paid payroll demo case into the active August dashboard cutoff",
  );
  await reverseJournalIfPosted(
    "demo-owner-paid-payroll-120m-current",
    "2026-08-06",
    "demo-owner-paid-payroll-120m-current-reversal",
    "Replace the aggregate payroll line with project-attributed payroll detail",
  );
  await seedJournal(
    "demo-owner-custody-withdrawal-90m-current",
    "2026-08-05",
    "Chủ doanh nghiệp rút 90 triệu từ ngân hàng công ty để giữ và chi hộ",
    [
      {
        accountCode: "3388-OWNER",
        debitMinor: "90000000",
        dimensions: { partyId: "demo-owner", ownerMovement: "company_cash_held_by_owner" },
      },
      {
        accountCode: "112-BANK",
        creditMinor: "90000000",
        dimensions: { partyId: "demo-owner", ownerMovement: "company_cash_held_by_owner" },
      },
    ],
  );
  await seedJournal(
    "demo-owner-paid-payroll-120m-itemized",
    "2026-08-06",
    "Chủ doanh nghiệp dùng tiền đang giữ và tiền cá nhân trả lương đội ngũ tháng 8",
    [
      {
        accountCode: "632-COGS",
        debitMinor: "35000000",
        dimensions: {
          partyId: "demo-dev-contractor",
          projectId: "demo-project-web",
          costCenter: "GENERAL",
          costType: "project_payroll",
          ownerMovement: "owner_paid_company_payroll",
        },
      },
      {
        accountCode: "632-COGS",
        debitMinor: "35000000",
        dimensions: {
          partyId: "demo-dev-contractor",
          projectId: "demo-project-ai",
          costCenter: "GENERAL",
          costType: "project_payroll",
          ownerMovement: "owner_paid_company_payroll",
        },
      },
      {
        accountCode: "642-OPEX",
        debitMinor: "50000000",
        dimensions: {
          partyId: "demo-owner",
          costCenter: "GENERAL",
          costType: "shared_payroll",
          ownerMovement: "owner_paid_company_payroll",
        },
      },
      {
        accountCode: "3388-OWNER",
        creditMinor: "120000000",
        dimensions: { partyId: "demo-owner", ownerMovement: "owner_paid_company_payroll" },
      },
    ],
  );
  for (const [month, date] of [
    ["10", "2026-10-25"],
    ["11", "2026-11-25"],
    ["12", "2026-12-25"],
  ])
    await seedJournal(
      `demo-operating-burn-2026-${month}`,
      date,
      `Chi phí vận hành định kỳ tháng ${month}/2026`,
      [
        {
          accountCode: "642-OPEX",
          debitMinor: "12000000",
          dimensions: { costCenter: "GENERAL", costType: "team_payroll", period: `2026-${month}` },
        },
        {
          accountCode: "642-OPEX",
          debitMinor: "6000000",
          dimensions: {
            costCenter: "GENERAL",
            costType: "workspace_rent",
            period: `2026-${month}`,
          },
        },
        {
          accountCode: "642-OPEX",
          debitMinor: "4000000",
          dimensions: {
            costCenter: "GENERAL",
            costType: "cloud_and_tools",
            period: `2026-${month}`,
          },
        },
        {
          accountCode: "642-OPEX",
          debitMinor: "2000000",
          dimensions: { costCenter: "GENERAL", costType: "marketing", period: `2026-${month}` },
        },
        {
          accountCode: "112-BANK",
          creditMinor: "24000000",
          dimensions: {
            costCenter: "GENERAL",
            cashFlowPurpose: "operating_burn",
            period: `2026-${month}`,
          },
        },
      ],
    );
  note(
    "journals",
    "opening capital, owner funding, itemized payroll and three months of operating burn posted",
  );
}

async function seedDocument(input, lifecycle) {
  if (!(await getOrNull(`/commercial-documents/${input.id}`)))
    await request("/commercial-documents", {
      method: "POST",
      body: input,
      key: `${input.id}:create`,
    });
  for (const [action, states, token] of lifecycle)
    await ensureAction("/commercial-documents", input.id, action, states, token);
}

async function seedDocuments() {
  const line = (
    id,
    description,
    net,
    tax,
    projectId,
    primaryAccountCode,
    taxAccountCode,
    taxCode,
    taxState,
  ) => ({
    description,
    quantity: "1",
    unitPriceMinor: net,
    netMinor: net,
    taxMinor: tax,
    grossMinor: String(BigInt(net) + BigInt(tax)),
    primaryAccountCode,
    taxAccountCode,
    taxCode,
    allocations: [
      {
        id,
        amountMinor: net,
        dimensions: {
          projectId,
          costCenter: "GENERAL",
          serviceLine: "WEB",
          ...(taxState ? { taxState } : {}),
        },
      },
    ],
  });
  await seedDocument(
    {
      id: "demo-sale-paid",
      type: "sales_invoice",
      documentNumber: "NAAI-DEMO-S001",
      series: "DM",
      fiscalYear: year,
      partyId: "demo-client-a",
      documentDate: "2026-06-05",
      dueDate: "2026-07-05",
      currency: "VND",
      netMinor: "100000000",
      taxMinor: "10000000",
      grossMinor: "110000000",
      controlAccountCode: "131-AR",
      lines: [
        line(
          "sale-paid-line",
          "Phát triển website",
          "100000000",
          "10000000",
          "demo-project-web",
          "511-REV",
          "3331-VAT",
          "VAT10_OUT",
        ),
      ],
    },
    [
      ["validate", ["draft"], makerToken],
      ["issue", ["validated"], makerToken],
    ],
  );
  await seedDocument(
    {
      id: "demo-sale-unpaid",
      type: "sales_invoice",
      documentNumber: "NAAI-DEMO-S002",
      series: "DM",
      fiscalYear: year,
      partyId: "demo-client-b",
      documentDate: "2026-10-10",
      dueDate: "2026-11-10",
      currency: "VND",
      netMinor: "60000000",
      taxMinor: "6000000",
      grossMinor: "66000000",
      controlAccountCode: "131-AR",
      lines: [
        line(
          "sale-unpaid-line",
          "Triển khai trợ lý AI",
          "60000000",
          "6000000",
          "demo-project-ai",
          "511-REV",
          "3331-VAT",
          "VAT10_OUT",
        ),
      ],
    },
    [
      ["validate", ["draft"], makerToken],
      ["issue", ["validated"], makerToken],
    ],
  );
  await seedDocument(
    {
      id: "demo-purchase-unpaid",
      type: "purchase_invoice",
      documentNumber: "SUP-DEMO-001",
      fiscalYear: year,
      partyId: "demo-supplier-a",
      documentDate: "2026-08-12",
      dueDate: "2026-09-12",
      currency: "VND",
      netMinor: "40000000",
      taxMinor: "4000000",
      grossMinor: "44000000",
      controlAccountCode: "331-AP",
      lines: [
        line(
          "purchase-line",
          "Thuê ngoài phát triển",
          "40000000",
          "4000000",
          "demo-project-web",
          "632-COGS",
          "1331-VAT",
          "VAT10_IN",
          "eligible",
        ),
      ],
    },
    [
      ["capture", ["draft"], makerToken],
      ["verify", ["captured"], makerToken],
      ["approve", ["verified"], checkerToken],
      ["post", ["approved"], makerToken],
    ],
  );
  await seedDocument(
    {
      id: "demo-sale-overdue",
      type: "sales_invoice",
      documentNumber: "NAAI-DEMO-S003",
      series: "DM",
      fiscalYear: year,
      partyId: "demo-client-b",
      documentDate: "2026-07-01",
      dueDate: "2026-07-31",
      currency: "VND",
      netMinor: "20000000",
      taxMinor: "2000000",
      grossMinor: "22000000",
      controlAccountCode: "131-AR",
      lines: [
        line(
          "sale-overdue-line",
          "Tư vấn và thiết lập pilot AI",
          "20000000",
          "2000000",
          "demo-project-ai",
          "511-REV",
          "3331-VAT",
          "VAT10_OUT",
        ),
      ],
    },
    [
      ["validate", ["draft"], makerToken],
      ["issue", ["validated"], makerToken],
    ],
  );
  await seedDocument(
    {
      id: "demo-sale-current",
      type: "sales_invoice",
      documentNumber: "NAAI-DEMO-S004",
      series: "DM",
      fiscalYear: year,
      partyId: "demo-client-a",
      documentDate: "2026-08-01",
      dueDate: "2026-08-20",
      currency: "VND",
      netMinor: "30000000",
      taxMinor: "3000000",
      grossMinor: "33000000",
      controlAccountCode: "131-AR",
      lines: [
        line(
          "sale-current-line",
          "Bàn giao chức năng quản trị nội dung",
          "30000000",
          "3000000",
          "demo-project-web",
          "511-REV",
          "3331-VAT",
          "VAT10_OUT",
        ),
      ],
    },
    [
      ["validate", ["draft"], makerToken],
      ["issue", ["validated"], makerToken],
    ],
  );
  await seedDocument(
    {
      id: "demo-purchase-overdue",
      type: "purchase_invoice",
      documentNumber: "SUP-DEMO-002",
      fiscalYear: year,
      partyId: "demo-supplier-a",
      documentDate: "2026-07-01",
      dueDate: "2026-07-31",
      currency: "VND",
      netMinor: "20000000",
      taxMinor: "2000000",
      grossMinor: "22000000",
      controlAccountCode: "331-AP",
      lines: [
        line(
          "purchase-overdue-line",
          "Dịch vụ triển khai dữ liệu AI",
          "20000000",
          "2000000",
          "demo-project-ai",
          "632-COGS",
          "1331-VAT",
          "VAT10_IN",
          "eligible",
        ),
      ],
    },
    [
      ["capture", ["draft"], makerToken],
      ["verify", ["captured"], makerToken],
      ["approve", ["verified"], checkerToken],
      ["post", ["approved"], makerToken],
    ],
  );
  note("documents", "paid, current unpaid, overdue sales and posted purchase invoice cases ready");
}

async function seedExpenseEvidence(expenseId, evidenceType) {
  const evidenceId = `${expenseId}-${evidenceType}`;
  if (!(await getOrNull(`/evidence/${evidenceId}`)))
    await request("/evidence", {
      method: "POST",
      body: {
        evidenceId,
        subjectType: "expense",
        subjectId: expenseId,
        evidenceType,
        originalFilename: `${evidenceId}.pdf`,
        declaredMediaType: "application/pdf",
        contentBase64: Buffer.from(`%PDF-1.7\nSynthetic ${evidenceType} for ${expenseId}`).toString(
          "base64",
        ),
        source: "local-demo",
      },
      key: `${evidenceId}:create`,
    });
  const evidence = await request(`/evidence/${evidenceId}`);
  const currentVersion = evidence.data.current_version ?? evidence.data.currentVersion;
  const currentEvidenceVersion = evidence.data.versions?.find(
    (item) => Number(item.version_number ?? item.versionNumber) === Number(currentVersion),
  );
  if ((currentEvidenceVersion?.review_state ?? currentEvidenceVersion?.reviewState) === "pending")
    await request(`/evidence/${evidenceId}/review`, {
      method: "POST",
      body: {
        state: "accepted",
        reason: `Accepted synthetic ${evidenceType}`,
        reference: `NAAI-DEMO-${evidenceType.toUpperCase()}`,
      },
      token: checkerToken,
      key: `${evidenceId}:accept`,
    });
}

async function seedReviewedExpense({ id, input, reviews, evidenceTypes = [] }) {
  if (!(await getOrNull(`/expenses/${id}`)))
    await request("/expenses", {
      method: "POST",
      body: { id, ...input },
      key: `${id}:create`,
    });
  await ensureAction("/expenses", id, "submit", ["draft"], makerToken);
  for (const evidenceType of evidenceTypes) await seedExpenseEvidence(id, evidenceType);
  let detail = await request(`/expenses/${id}`);
  for (const [axis, state, eligibleMinor] of reviews) {
    const current = detail.data.lines?.[0]?.[`${axis}_state`] ?? detail.data[`${axis}_state`];
    if (!current || current === "unreviewed")
      await request(`/expenses/${id}/review`, {
        method: "POST",
        body: {
          axis,
          lineNumber: 1,
          state,
          eligibleMinor,
          reason: `NAAI demo ${axis} review`,
        },
        token: checkerToken,
        key: `${id}:review:${axis}`,
      });
    detail = await request(`/expenses/${id}`);
  }
  await ensureAction("/expenses", id, "approve", ["submitted"], checkerToken);
  await ensureAction("/expenses", id, "post", ["approved"], checkerToken);
}

async function seedExpense() {
  await seedReviewedExpense({
    id: "demo-expense-office",
    input: {
      expenseClass: "non_documented",
      payeePartyId: "demo-supplier-a",
      expenseDate: "2026-07-20",
      businessPurpose: "Chi phí văn phòng do chủ doanh nghiệp chi hộ",
      currency: "VND",
      netMinor: "3000000",
      vatMinor: "0",
      grossMinor: "3000000",
      counterAccountCode: "3388-OWNER",
      lines: [
        {
          description: "Vật tư văn phòng",
          netMinor: "3000000",
          vatMinor: "0",
          grossMinor: "3000000",
          postingAccountCode: "642-OPEX",
          allocations: [
            {
              id: "office",
              amountMinor: "3000000",
              dimensions: { costCenter: "GENERAL", projectId: "demo-project-web" },
            },
          ],
        },
      ],
    },
    reviews: [
      ["management", "valid", "0"],
      ["cit", "ineligible", "0"],
      ["vat", "ineligible", "0"],
    ],
  });
  await seedReviewedExpense({
    id: "demo-expense-freelance-ui",
    input: {
      expenseClass: "contract_backed",
      payeePartyId: "demo-freelancer-ui",
      expenseDate: "2026-07-28",
      businessPurpose: "Thuê freelancer hoàn thiện UI và design system cho dự án website An Phát",
      currency: "VND",
      netMinor: "18000000",
      vatMinor: "0",
      grossMinor: "18000000",
      counterAccountCode: "3388-OWNER",
      lines: [
        {
          description: "Freelance UI/UX theo hợp đồng khoán việc",
          netMinor: "18000000",
          vatMinor: "0",
          grossMinor: "18000000",
          postingAccountCode: "632-COGS",
          allocations: [
            {
              id: "freelance-ui-web",
              amountMinor: "18000000",
              dimensions: {
                costCenter: "GENERAL",
                projectId: "demo-project-web",
                costType: "freelancer",
              },
            },
          ],
        },
      ],
    },
    reviews: [
      ["management", "valid", "0"],
      ["cit", "eligible", "18000000"],
      ["vat", "ineligible", "0"],
    ],
    evidenceTypes: ["contract", "acceptance"],
  });
  await seedReviewedExpense({
    id: "demo-expense-contract-dev-ai",
    input: {
      expenseClass: "contract_backed",
      payeePartyId: "demo-dev-contractor",
      expenseDate: "2026-08-03",
      businessPurpose: "Thuê dev backend tích hợp dữ liệu và API cho dự án Trợ lý AI Bình Minh",
      currency: "VND",
      netMinor: "28000000",
      vatMinor: "0",
      grossMinor: "28000000",
      counterAccountCode: "3388-OWNER",
      lines: [
        {
          description: "Dev backend theo hợp đồng cộng tác dự án",
          netMinor: "28000000",
          vatMinor: "0",
          grossMinor: "28000000",
          postingAccountCode: "632-COGS",
          allocations: [
            {
              id: "contract-dev-ai",
              amountMinor: "28000000",
              dimensions: {
                costCenter: "GENERAL",
                projectId: "demo-project-ai",
                costType: "contract_dev",
              },
            },
          ],
        },
      ],
    },
    reviews: [
      ["management", "valid", "0"],
      ["cit", "eligible", "28000000"],
      ["vat", "ineligible", "0"],
    ],
    evidenceTypes: ["contract", "acceptance"],
  });
  note(
    "expense",
    "office, freelance UI and contract backend-dev costs posted with project allocations",
  );
}

async function seedBanking() {
  for (const account of [
    {
      id: "demo-bank",
      code: "VCB-DEMO",
      kind: "bank",
      displayName: "VCB - tài khoản công ty demo",
      currency: "VND",
      ledgerAccountCode: "112-BANK",
      bankCode: "VCB",
      maskedIdentifier: "******2026",
      accountIdentity: "NAAI-DEMO-2026",
    },
    {
      id: "demo-cash",
      code: "CASH-DEMO",
      kind: "cash",
      displayName: "Quỹ tiền mặt demo",
      currency: "VND",
      ledgerAccountCode: "111-CASH",
      maskedIdentifier: "CASH",
      accountIdentity: "NAAI-CASH-DEMO",
    },
  ]) {
    const listed = await request("/banking/accounts");
    if (!listed.data.items.some((item) => (item.id ?? item.accountId) === account.id))
      await request("/banking/accounts", {
        method: "POST",
        body: account,
        key: `bank-account:${account.id}`,
      });
  }
  const csvText = [
    "provider_transaction_id,booking_date,value_date,amount_minor,currency,reference,description,counterparty",
    "DEMO-BANK-RECEIPT-001,2026-06-20,2026-06-20,110000000,VND,NAAI-DEMO-S001,Khách hàng thanh toán,Công ty An Phát",
    "DEMO-BANK-FEE-001,2026-06-20,2026-06-20,-220000,VND,FEE-001,Phí ngân hàng,VCB",
  ].join("\n");
  const imports = await request("/banking/imports");
  if (!imports.data.items?.some((item) => item.id === "demo-bank-import")) {
    const input = {
      id: "demo-bank-import",
      financialAccountId: "demo-bank",
      adapterId: "generic-csv",
      adapterVersion: 1,
      filename: "naai-demo-bank-2026.csv",
      csvText,
    };
    await request("/banking/imports/dry-run", { method: "POST", body: input });
    await request("/banking/imports", { method: "POST", body: input, key: "bank-import" });
  }
  for (const movementImport of [
    {
      id: "demo-bank-cash-movements",
      financialAccountId: "demo-bank",
      filename: "naai-demo-bank-cash-movements-2026.csv",
      csvText: [
        "provider_transaction_id,booking_date,value_date,amount_minor,currency,reference,description,counterparty",
        "DEMO-BANK-TO-CASH-OUT,2026-07-01,2026-07-01,-10000000,VND,RUT-QUY-001,Rút tiền ngân hàng nhập quỹ,NAAI Studio",
        "DEMO-CASH-TO-BANK-IN,2026-07-15,2026-07-15,3000000,VND,NOP-NGAN-HANG-001,Nộp tiền mặt vào ngân hàng,NAAI Studio",
      ].join("\n"),
    },
    {
      id: "demo-cash-bank-movements",
      financialAccountId: "demo-cash",
      filename: "naai-demo-cash-bank-movements-2026.csv",
      csvText: [
        "provider_transaction_id,booking_date,value_date,amount_minor,currency,reference,description,counterparty",
        "DEMO-BANK-TO-CASH-IN,2026-07-01,2026-07-01,10000000,VND,RUT-QUY-001,Nhập quỹ từ tài khoản ngân hàng,NAAI Studio",
        "DEMO-CASH-TO-BANK-OUT,2026-07-15,2026-07-15,-3000000,VND,NOP-NGAN-HANG-001,Xuất quỹ nộp vào ngân hàng,NAAI Studio",
      ].join("\n"),
    },
  ]) {
    if (!imports.data.items?.some((item) => item.id === movementImport.id)) {
      const input = {
        ...movementImport,
        adapterId: "generic-csv",
        adapterVersion: 1,
      };
      await request("/banking/imports/dry-run", { method: "POST", body: input });
      await request("/banking/imports", {
        method: "POST",
        body: input,
        key: `bank-import:${movementImport.id}`,
      });
    }
  }
  const transactions = await request("/banking/transactions");
  const receipt = transactions.data.items.find(
    (item) =>
      item.provider_transaction_id === "DEMO-BANK-RECEIPT-001" ||
      item.providerTransactionId === "DEMO-BANK-RECEIPT-001",
  );
  if (receipt && !["reconciled", "ignored"].includes(receipt.state)) {
    const transactionId = receipt.id ?? receipt.transactionId;
    if (!["suggested", "matched"].includes(receipt.state))
      await request(`/banking/transactions/${transactionId}/suggest`, {
        method: "POST",
        body: { schemaVersion: 1 },
        key: "receipt-suggest",
      });
    await request(`/banking/transactions/${transactionId}/match`, {
      method: "POST",
      body: {
        schemaVersion: 1,
        baseAmountMinor: "110000000",
        allocations: [
          {
            targetType: "commercial_document",
            targetId: "demo-sale-paid",
            targetAmountMinor: "110000000",
            targetCurrency: "VND",
            baseAmountMinor: "110000000",
          },
        ],
        adjustments: [],
      },
      key: "receipt-match",
    });
    await request(`/banking/transactions/${transactionId}/reconcile`, {
      method: "POST",
      body: { schemaVersion: 1, reason: "NAAI demo customer receipt" },
      key: "receipt-reconcile",
    });
  }
  const providerId = (item) => item.provider_transaction_id ?? item.providerTransactionId;
  const transactionByProviderId = new Map(
    transactions.data.items.map((item) => [providerId(item), item.id ?? item.transactionId]),
  );
  const transfers = await request("/banking/internal-transfers");
  for (const transfer of [
    {
      id: "demo-transfer-bank-to-cash",
      sourceTransactionId: transactionByProviderId.get("DEMO-BANK-TO-CASH-OUT"),
      destinationTransactionId: transactionByProviderId.get("DEMO-BANK-TO-CASH-IN"),
      principalAmountMinor: "10000000",
      reason: "Rút tiền từ VCB nhập quỹ tiền mặt",
    },
    {
      id: "demo-transfer-cash-to-bank",
      sourceTransactionId: transactionByProviderId.get("DEMO-CASH-TO-BANK-OUT"),
      destinationTransactionId: transactionByProviderId.get("DEMO-CASH-TO-BANK-IN"),
      principalAmountMinor: "3000000",
      reason: "Nộp tiền mặt từ quỹ vào VCB",
    },
  ]) {
    if (!transfer.sourceTransactionId || !transfer.destinationTransactionId)
      throw new Error(`Missing demo internal-transfer legs for ${transfer.id}`);
    if (!transfers.data.items?.some((item) => item.id === transfer.id))
      await request("/banking/internal-transfers", {
        method: "POST",
        body: {
          schemaVersion: 1,
          ...transfer,
          basePrincipalAmountMinor: transfer.principalAmountMinor,
          currency: "VND",
          transitAccountId: "113-TRANSIT",
          postingMode: "direct",
        },
        key: `internal-transfer:${transfer.id}`,
      });
  }
  note(
    "banking",
    "company bank/cash accounts, customer receipt and two reconciled internal cash movements ready",
  );
}

async function seedPlanning() {
  const targets = await request("/revenue-targets");
  if (!targets.data.items.some((item) => item.id === "demo-target-oct-2026"))
    await request("/revenue-targets", {
      method: "POST",
      body: {
        schemaVersion: 1,
        id: "demo-target-oct-2026",
        versionNumber: 1,
        periodKind: "month",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        actualBasis: "invoiced",
        currency: "VND",
        amountMinor: "80000000",
        dimensions: {},
        reason: "NAAI demo October target",
      },
      key: "target-oct-create",
    });
  const target = (await request("/revenue-targets")).data.items.find(
    (item) => item.id === "demo-target-oct-2026",
  );
  if (target?.state === "draft")
    await request("/revenue-targets/demo-target-oct-2026/publish", {
      method: "POST",
      body: {
        schemaVersion: 1,
        expectedResourceVersion: String(target.version ?? target.resourceVersion ?? 1),
        reason: "Publish demo target",
      },
      token: checkerToken,
      key: "target-oct-publish",
    });
  const forecasts = await request("/forecast-versions");
  if (!forecasts.data.items.some((item) => item.id === "demo-forecast-invoiced-2026"))
    await request("/forecast-versions", {
      method: "POST",
      body: {
        schemaVersion: 1,
        id: "demo-forecast-invoiced-2026",
        versionNumber: 1,
        scenario: "base",
        snapshotKind: "month_end",
        asOfDate: "2026-08-31",
        startsOn: "2026-09-01",
        endsOn,
        actualBasis: "invoiced",
        currency: "VND",
        reason: "NAAI demo forecast",
      },
      key: "forecast-invoiced-create",
    });
  const components = await request("/forecast-versions/demo-forecast-invoiced-2026/components");
  if (!components.data.items.some((item) => item.kind === "opening_cash"))
    await request("/forecast-versions/demo-forecast-invoiced-2026/components", {
      method: "POST",
      body: {
        schemaVersion: 1,
        id: "demo-forecast-opening-cash",
        section: "cash",
        kind: "opening_cash",
        direction: "increase",
        // Current PostgreSQL date decoding shifts this DATE by the +07 runtime offset.
        // Use the API-observed as-of date until the runtime date codec is corrected.
        scheduledOn: "2026-08-30",
        amountMinor: "420000000",
        probabilityBps: 10000,
        currency: "VND",
        source: { type: "bank_balance", id: "demo-bank" },
        reason: "Opening cash for retained forecast",
      },
      key: "forecast-invoiced-opening-cash",
    });
  if (!components.data.items.some((item) => item.id === "demo-forecast-pipeline"))
    await request("/forecast-versions/demo-forecast-invoiced-2026/components", {
      method: "POST",
      body: {
        schemaVersion: 1,
        id: "demo-forecast-pipeline",
        section: "revenue",
        kind: "weighted_pipeline",
        direction: "increase",
        scheduledOn: "2026-11-30",
        amountMinor: "90000000",
        probabilityBps: 7000,
        currency: "VND",
        source: {
          type: "opportunity",
          id: "demo-project-ai-opportunity",
          commercialRootType: "opportunity",
          commercialRootId: "demo-project-ai-opportunity",
        },
        reason: "Expected AI project revenue",
      },
      key: "forecast-invoiced-component",
    });
  const forecast = (await request("/forecast-versions")).data.items.find(
    (item) => item.id === "demo-forecast-invoiced-2026",
  );
  if (forecast?.state === "draft")
    await request("/forecast-versions/demo-forecast-invoiced-2026/publish", {
      method: "POST",
      body: {
        schemaVersion: 1,
        expectedResourceVersion: String(forecast.version ?? forecast.resourceVersion ?? 1),
        reason: "Publish demo forecast",
      },
      token: checkerToken,
      key: "forecast-invoiced-publish",
    });
  note("planning", "annual target and retained forecast published");
}

const reportRequests = [
  ["trial-balance", `/reports/trial-balance?from=${startsOn}&to=${endsOn}`],
  ["general-ledger", `/reports/general-ledger?from=${startsOn}&to=${endsOn}`],
  [
    "profit-and-loss",
    `/reports/financial-statements/profit-and-loss?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  [
    "balance-sheet",
    `/reports/financial-statements/balance-sheet?endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  [
    "cash-flow",
    `/reports/financial-statements/cash-flow?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  [
    "vat-reconciliation",
    `/reports/tax/vat-reconciliation?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  [
    "expense-exceptions",
    `/reports/tax/expense-exceptions?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  ["ar-aging", `/reports/ar-aging?asOf=${endsOn}`],
  ["ap-aging", `/reports/ap-aging?asOf=${endsOn}`],
  ["project-profitability", `/reports/project-profitability?startsOn=${startsOn}&endsOn=${endsOn}`],
  [
    "executive-metrics",
    `/reports/executive-metrics?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  [
    "operating-dashboard",
    `/reports/operating-dashboard?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
  ],
  [
    "performance-comparisons",
    `/reports/performance-comparisons?periodId=CAL-2026-10&periodBasis=calendar&actualBasis=invoiced&asOfInstant=${encodeURIComponent("2026-10-15T16:59:59.000Z")}&forecastVersionId=demo-forecast-invoiced-2026`,
  ],
];

async function verifyDemoProjectCosts() {
  for (const expected of [
    {
      id: "demo-expense-freelance-ui",
      amountMinor: "18000000",
      projectId: "demo-project-web",
      payeePartyId: "demo-freelancer-ui",
    },
    {
      id: "demo-expense-contract-dev-ai",
      amountMinor: "28000000",
      projectId: "demo-project-ai",
      payeePartyId: "demo-dev-contractor",
    },
  ]) {
    const expense = (await request(`/expenses/${expected.id}`)).data;
    const allocation = expense.lines?.[0]?.allocations?.[0];
    const dimensions = allocation?.dimensions ?? {};
    if (
      expense.state !== "posted" ||
      String(expense.grossMinor ?? expense.gross_minor) !== expected.amountMinor ||
      (expense.payeePartyId ?? expense.payee_party_id) !== expected.payeePartyId ||
      dimensions.projectId !== expected.projectId
    )
      throw new Error(`Demo project expense readback mismatch: ${expected.id}`);
  }
  const payroll = (await request("/journals/demo-owner-paid-payroll-120m-itemized")).data;
  const payrollLines = payroll.lines ?? [];
  const directPayroll = payrollLines.filter(
    (line) =>
      (line.accountCode ?? line.account_code) === "632-COGS" &&
      line.dimensions?.costType === "project_payroll",
  );
  const directPayrollTotal = directPayroll.reduce(
    (sum, line) => sum + BigInt(line.debitMinor ?? line.debit_minor ?? 0),
    0n,
  );
  const projectIds = new Set(directPayroll.map((line) => line.dimensions?.projectId));
  if (
    payroll.state !== "posted" ||
    directPayrollTotal !== 70000000n ||
    !projectIds.has("demo-project-web") ||
    !projectIds.has("demo-project-ai")
  )
    throw new Error("Demo itemized project payroll readback mismatch");
  note(
    "project-cost-readback",
    "posted payroll 70m across two projects plus freelance 18m and contract dev 28m verified",
  );
}

async function verifyDemoRunway() {
  const metrics = (
    await request(
      `/reports/executive-metrics?startsOn=${startsOn}&endsOn=${endsOn}&asOfInstant=${encodeURIComponent(asOfInstant)}&framework=TT133`,
    )
  ).data;
  if (
    metrics.runwayStatus !== "available" ||
    metrics.averageOperatingNetCashFlowMinor !== "-24000000" ||
    metrics.netBurnMinor !== "24000000" ||
    metrics.unrestrictedCashMinor !== "261000000" ||
    metrics.runwayMonthsThousandths !== "10875"
  )
    throw new Error("Demo runway readback is not available");
  note(
    "runway-readback",
    `${metrics.runwayMonthsThousandths} thousandths of a month from cash ${metrics.unrestrictedCashMinor} and burn ${metrics.netBurnMinor}`,
  );
}

async function verifyReports() {
  const verification = [];
  for (const [name, path] of reportRequests) {
    try {
      const response = await request(path);
      verification.push({ name, ok: true, requestId: response.requestId ?? response.request_id });
      note(`report:${name}`, "ok");
    } catch (error) {
      verification.push({ name, ok: false, error: error.payload?.error?.code ?? error.message });
      note(`report:${name}`, `failed: ${error.payload?.error?.code ?? error.message}`);
    }
  }
  return verification;
}

async function seedSnapshotAndExports() {
  const snapshotId = "demo-pnl-2026";
  const snapshots = await request("/report-snapshots");
  if (!snapshots.data.items.some((item) => item.id === snapshotId))
    await request("/report-snapshots", {
      method: "POST",
      body: {
        reportKind: "profit_and_loss",
        period: { startsOn, endsOn, asOfDate: endsOn },
        dimensions: {},
        accountingBasis: "accrual",
        framework: "TT133",
        formulaVersions: { profitAndLoss: "profit-and-loss-v1" },
        request: { snapshotId, asOfInstant },
      },
      key: "snapshot-create",
    });
  const snapshot = await request(`/report-snapshots/${snapshotId}?version=1`);
  await request(`/report-snapshots/${snapshotId}/versions/1/reproduce`, { method: "POST" });
  const exports = [];
  for (const format of ["csv", "xlsx"]) {
    const created = await request("/accountant-exports", {
      method: "POST",
      body: { snapshotId, snapshotVersion: 1, reportKind: "profit_and_loss", format },
      key: `export-${format}`,
    });
    exports.push({
      format,
      id: created.data.id,
      version: created.data.version,
      downloadUrl: created.data.downloadUrl,
      contentHash: created.data.contentHash,
    });
  }
  note("exports", `snapshot ${snapshot.data.id}:1 and CSV/XLSX exports ready`);
  return { snapshot: snapshot.data, exports };
}

if (!verifyOnly) {
  await seedMasterData();
  await seedPolicies();
  await seedProjectEconomics();
  await seedJournals();
  await seedDocuments();
  await seedExpense();
  await seedBanking();
  try {
    await seedPlanning();
  } catch (error) {
    note(
      "planning",
      `not available in current runtime: ${error.payload?.error?.code ?? error.message}`,
    );
  }
}

const verification = await verifyReports();
await verifyDemoProjectCosts();
await verifyDemoRunway();
let exportResult = null;
if (!verifyOnly) exportResult = await seedSnapshotAndExports();
const failedReports = verification.filter((item) => !item.ok);
process.stdout.write(
  `${JSON.stringify({ organizationId, baseUrl, verifyOnly, failedReports, exportResult, stages: results }, null, 2)}\n`,
);
if (failedReports.length) process.exitCode = 1;
