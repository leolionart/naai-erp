import { AdminConsole } from "./admin-console";

type ModuleKey = "overview" | "master-data" | "ledger" | "documents" | "expenses" | "evidence";

const modules: ReadonlyArray<{
  key: ModuleKey | string;
  label: string;
  icon: string;
  status: "available" | "building" | "planned";
}> = [
  { key: "overview", label: "Tổng quan", icon: "grid", status: "available" },
  { key: "master-data", label: "Dữ liệu nền", icon: "folder", status: "available" },
  { key: "ledger", label: "Sổ kế toán", icon: "book", status: "available" },
  { key: "documents", label: "Hóa đơn", icon: "invoice", status: "available" },
  { key: "expenses", label: "Chi phí", icon: "wallet", status: "available" },
  { key: "evidence", label: "Chứng từ", icon: "paperclip", status: "building" },
  { key: "banking", label: "Ngân hàng", icon: "bank", status: "planned" },
  { key: "forecast", label: "Dự báo", icon: "trend", status: "planned" },
  { key: "reports", label: "Báo cáo", icon: "chart", status: "planned" },
];

const views: Record<
  ModuleKey,
  {
    title: string;
    eyebrow: string;
    description: string;
    features: string[];
    endpoint: string;
    cli: string;
  }
> = {
  overview: {
    title: "NAAI ERP Admin",
    eyebrow: "Gate G3 · Documents & integrations",
    description:
      "Bảng điều hướng cho các module đã có API và CLI. Dữ liệu thật sẽ xuất hiện sau khi cấu hình organization và access token local.",
    features: [
      "G0 Foundation hoàn tất",
      "G1 Master data hoàn tất",
      "G2 Accounting kernel hoàn tất",
      "ERP-300/310 đã qua PostgreSQL CI",
    ],
    endpoint: "GET /health",
    cli: "curl http://localhost:3001/health",
  },
  "master-data": {
    title: "Dữ liệu nền",
    eyebrow: "Organization, tài khoản, dimensions, parties & projects",
    description:
      "Quản lý kỳ tài chính, hệ thống tài khoản TT133/TT200, tax codes, khách hàng, nhà cung cấp, dự án, hợp đồng và milestone.",
    features: [
      "Organization & fiscal periods",
      "Chart of Accounts & tax codes",
      "Cost center / service line / category",
      "Party, project, contract, milestone",
    ],
    endpoint: "GET /api/v1/organizations/:org/master-data/:resource",
    cli: "pnpm cli accounts list --organization <org>",
  },
  ledger: {
    title: "Sổ kế toán",
    eyebrow: "Double-entry accounting kernel",
    description:
      "Tạo, duyệt, post, reverse journal; đóng/mở kỳ; xem Trial Balance và General Ledger. Journal đã post là bất biến.",
    features: [
      "Balanced journal",
      "Posting rules",
      "Approve / post / reverse",
      "Trial Balance & General Ledger",
    ],
    endpoint: "GET /api/v1/organizations/:org/reports/trial-balance",
    cli: "pnpm cli reports trial-balance --organization <org> --from 2026-01-01 --to 2026-12-31",
  },
  documents: {
    title: "Hóa đơn đầu ra & đầu vào",
    eyebrow: "ERP-300 · Verified",
    description:
      "Sales Invoice, Purchase Invoice và Credit Note có allocation theo project/dimension, lifecycle kiểm soát và journal liên kết.",
    features: [
      "Sales invoice → AR / revenue / VAT",
      "Purchase invoice → expense / VAT / AP",
      "Credit note có cap theo invoice gốc",
      "Idempotency, audit & outbox",
    ],
    endpoint: "GET /api/v1/organizations/:org/commercial-documents",
    cli: "pnpm cli commercial-documents list --organization <org>",
  },
  expenses: {
    title: "Chi phí doanh nghiệp",
    eyebrow: "ERP-310 · Verified",
    description:
      "Theo dõi chi phí có hoặc không hóa đơn, hoàn ứng nhân viên, petty cash và các trục quản trị/CIT/VAT độc lập.",
    features: [
      "Invoice & non-invoice expense",
      "Employee reimbursement",
      "CIT/VAT review độc lập",
      "Allocation và journal tự động",
    ],
    endpoint: "GET /api/v1/organizations/:org/expenses",
    cli: "pnpm cli expenses list --organization <org>",
  },
  evidence: {
    title: "Chứng từ đính kèm",
    eyebrow: "ERP-320 · Đang phát triển",
    description:
      "PDF, XML và ảnh sẽ được version hóa, kiểm tra hash/MIME, phát hiện trùng và cấp signed download URL sau phân quyền.",
    features: [
      "PDF/XML/JPEG/PNG",
      "SHA-256 & duplicate warning",
      "Replacement giữ lịch sử",
      "Signed URL & download audit",
    ],
    endpoint: "POST /api/v1/organizations/:org/evidence",
    cli: "pnpm cli evidence upload --organization <org> --data '<json>'",
  },
};

function Icon({ name }: { name: string }) {
  const path =
    name === "grid"
      ? "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"
      : name === "book"
        ? "M4 5h6a2 2 0 0 1 2 2v13a3 3 0 0 0-3-3H4zm16 0h-6a2 2 0 0 0-2 2v13a3 3 0 0 1 3-3h5z"
        : name === "invoice"
          ? "M6 3h9l3 3v15H6zm3 7h6m-6 4h6m-6 4h3"
          : name === "wallet"
            ? "M4 6h14a2 2 0 0 1 2 2v10H4zm11 6h5"
            : name === "bank"
              ? "m3 9 9-5 9 5M5 10v8m5-8v8m4-8v8m5-8v8M3 20h18"
              : name === "trend"
                ? "M4 18l6-6 4 4 6-9m-5 0h5v5"
                : name === "chart"
                  ? "M4 20V10m6 10V4m6 16v-7M2 20h20"
                  : name === "paperclip"
                    ? "m8 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l8-8"
                    : "M3 6h7l2 2h9v11H3z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const requested = (await searchParams).module;
  const active: ModuleKey = requested && requested in views ? (requested as ModuleKey) : "overview";
  const view = views[active];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>N</span>
          <div>
            NAAI ERP<small>AI-native finance</small>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">
          {modules.map((module) => (
            <a
              className={`nav-item ${module.key === active ? "active" : ""} ${module.status === "planned" ? "disabled" : ""}`}
              href={module.status === "planned" ? `/?module=${active}` : `/?module=${module.key}`}
              key={module.key}
              aria-disabled={module.status === "planned"}
            >
              <Icon name={module.icon} />
              <span>{module.label}</span>
              <small>
                {module.status === "available"
                  ? "live"
                  : module.status === "building"
                    ? "build"
                    : "soon"}
              </small>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">AT</div>
          <div>
            <strong>Ái Trần</strong>
            <small>Owner · NAAI Studio</small>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Admin / {view.title}</span>
            <h1>{view.title}</h1>
          </div>
          <div className="runtime">
            <i />
            Local development
          </div>
        </header>
        <section className="hero-panel">
          <div>
            <span className="eyebrow">{view.eyebrow}</span>
            <h2>{view.title}</h2>
            <p>{view.description}</p>
          </div>
          <span className={`status-pill ${active === "evidence" ? "building" : "ready"}`}>
            {active === "evidence" ? "Đang làm" : "Có thể dùng qua API/CLI"}
          </span>
        </section>

        <section className="feature-grid" aria-label={`Tính năng ${view.title}`}>
          {view.features.map((feature, index) => (
            <article className="feature-card" key={feature}>
              <span>0{index + 1}</span>
              <strong>{feature}</strong>
              <small>Organization scoped · audited</small>
            </article>
          ))}
        </section>

        <div className="content-grid admin-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>API endpoint</h2>
                <p>Canonical machine-readable interface</p>
              </div>
              <span className="api-badge">REST v1</span>
            </div>
            <code className="command-block">{view.endpoint}</code>
            <p className="helper">
              API, CLI và UI cùng đi qua application service, không truy cập PostgreSQL trực tiếp.
            </p>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Thử bằng CLI</h2>
                <p>JSON output mặc định cho AI agents</p>
              </div>
              <span className="api-badge dark">CLI</span>
            </div>
            <code className="command-block">{view.cli}</code>
            <p className="helper">Cần NAAI_ERP_TOKEN và API local tại http://localhost:3001.</p>
          </section>
        </div>

        <section className="panel module-map">
          <div className="panel-head">
            <div>
              <h2>Tình trạng module</h2>
              <p>Menu được bật theo implementation đã có, không theo mock UI.</p>
            </div>
          </div>
          <div className="module-table">
            <span>Foundation & Master data</span>
            <b>Hoàn tất</b>
            <span>Accounting kernel</span>
            <b>Hoàn tất</b>
            <span>Invoice & expense</span>
            <b>Hoàn tất</b>
            <span>Evidence management</span>
            <b className="progress">Đang làm</b>
            <span>Banking, forecast, reporting</span>
            <b className="muted">Theo task ledger</b>
          </div>
        </section>
        <AdminConsole moduleKey={active} />
      </main>
    </div>
  );
}
