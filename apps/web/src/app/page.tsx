const modules = [
  { label: "Tổng quan", icon: "grid", active: true },
  { label: "Thu & chi", icon: "swap", active: false },
  { label: "Hóa đơn", icon: "invoice", active: false },
  { label: "Chi phí", icon: "wallet", active: false },
  { label: "Ngân hàng", icon: "bank", active: false },
  { label: "Dự án", icon: "folder", active: false },
  { label: "Sổ kế toán", icon: "book", active: false },
  { label: "Dự báo", icon: "trend", active: false },
  { label: "Báo cáo", icon: "chart", active: false },
] as const;

const metrics = [
  { label: "Doanh thu tháng", value: "—", note: "Chờ dữ liệu hóa đơn", tone: "blue" },
  { label: "Chi phí tháng", value: "—", note: "Chờ dữ liệu chi phí", tone: "amber" },
  { label: "Lợi nhuận tạm tính", value: "—", note: "Sẽ tính từ sổ đã post", tone: "green" },
  { label: "Vốn chủ sở hữu", value: "—", note: "Sẽ có tại báo cáo tài chính", tone: "violet" },
] as const;

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    swap: (
      <>
        <path d="M7 7h11l-3-3" />
        <path d="m18 17H7l3 3" />
      </>
    ),
    invoice: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 10h6M9 14h6M9 18h3" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6h14a2 2 0 0 1 2 2v10H4z" />
        <path d="M4 6V5a2 2 0 0 1 2-2h10" />
        <path d="M15 12h5" />
      </>
    ),
    bank: (
      <>
        <path d="m3 9 9-5 9 5" />
        <path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" />
      </>
    ),
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    book: (
      <>
        <path d="M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 2z" />
        <path d="M20 5a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 2z" />
      </>
    ),
    trend: (
      <>
        <path d="M4 18 10 12l4 4 6-9" />
        <path d="M15 7h5v5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>N</span>
          <div>
            NAAI ERP<small>Finance workspace</small>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">
          {modules.map((module) => (
            <a
              className={module.active ? "nav-item active" : "nav-item"}
              href={module.active ? "/" : `/#${module.icon}`}
              key={module.label}
            >
              <Icon name={module.icon} />
              <span>{module.label}</span>
              {!module.active ? <small>soon</small> : null}
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
            <h1>Tổng quan tài chính</h1>
            <p>Tháng 08, 2026 · Asia/Ho_Chi_Minh</p>
          </div>
          <div className="top-actions">
            <button className="ghost" disabled title="Sẽ mở khi module import được triển khai">
              Nhập dữ liệu
            </button>
            <button className="primary" disabled title="Sẽ mở khi module giao dịch được triển khai">
              + Tạo giao dịch
            </button>
          </div>
        </header>

        <section className="notice">
          <div>
            <strong>Hệ thống đang được xây dựng tuần tự</strong>
            <p>
              Organization, kỳ tài chính, hệ thống tài khoản và tax policy đã hoàn tất. Các menu
              tiếp theo sẽ được kích hoạt theo coding plan.
            </p>
          </div>
          <span>Gate G2 · ERP-200 accounting kernel tiếp theo</span>
        </section>

        <section className="metric-grid" aria-label="Chỉ số chính">
          {metrics.map((metric) => (
            <article className={`metric ${metric.tone}`} key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </article>
          ))}
        </section>

        <div className="content-grid">
          <section className="panel progress-panel">
            <div className="panel-head">
              <div>
                <h2>Tiến độ xây dựng</h2>
                <p>Nền tảng nghiệp vụ theo acceptance gate</p>
              </div>
              <span>16%</span>
            </div>
            <div className="progress-track">
              <i />
            </div>
            <ol className="phase-list">
              <li className="done">
                <b>G0</b>
                <div>
                  <strong>Foundation</strong>
                  <small>Repository, architecture, security baseline</small>
                </div>
                <span>Hoàn tất</span>
              </li>
              <li className="done">
                <b>G1</b>
                <div>
                  <strong>Master data</strong>
                  <small>Accounts, dimensions, parties</small>
                </div>
                <span>Hoàn tất</span>
              </li>
              <li className="current">
                <b>G2</b>
                <div>
                  <strong>Accounting kernel</strong>
                  <small>Double-entry, posting, period close</small>
                </div>
                <span>Đang làm</span>
              </li>
              <li>
                <b>G3</b>
                <div>
                  <strong>Invoice & expense</strong>
                  <small>Documents, evidence, webhooks</small>
                </div>
                <span>Chờ</span>
              </li>
            </ol>
          </section>

          <section className="panel readiness">
            <div className="panel-head">
              <div>
                <h2>Sẵn sàng dữ liệu</h2>
                <p>Những phần cần hoàn thiện trước khi có báo cáo thật</p>
              </div>
            </div>
            <ul>
              <li>
                <span className="ok">✓</span>
                <div>
                  <strong>Tổ chức & kỳ tài chính</strong>
                  <small>Đã có schema và kiểm thử isolation</small>
                </div>
              </li>
              <li>
                <span className="ok">✓</span>
                <div>
                  <strong>Hệ thống tài khoản</strong>
                  <small>TT133/TT200 và tax policy có version</small>
                </div>
              </li>
              <li>
                <span className="ok">✓</span>
                <div>
                  <strong>Dimensions & mappings</strong>
                  <small>Allocation và default mappings đã kiểm thử</small>
                </div>
              </li>
              <li>
                <span className="ok">✓</span>
                <div>
                  <strong>Khách hàng & dự án</strong>
                  <small>Party, project, contract và milestone đã kiểm thử</small>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
