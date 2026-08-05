import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { PageShell } from "./page-shell";
import { SkipLink } from "./skip-link";

describe("server-compatible layout primitives", () => {
  it("renders a skip target and semantic main content without client state", () => {
    const html = renderToStaticMarkup(
      <PageShell navigation={<aside aria-label="Điều hướng">Navigation</aside>}>
        <p>Nội dung</p>
      </PageShell>,
    );
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('<main class="workspace" id="main-content" tabindex="-1">');
    expect(html).toContain('aria-label="Điều hướng"');
  });

  it("renders accessible breadcrumbs, page status and actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Sổ kế toán"
        description="Journal và báo cáo"
        breadcrumbs={[{ label: "Admin", href: "/" }, { label: "Sổ kế toán" }]}
        status={<span>Đã đồng bộ</span>}
        actions={<button>Thêm journal</button>}
      />,
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Thêm journal");
    expect(html).toContain("Đã đồng bộ");
  });

  it("allows a custom skip target", () => {
    expect(renderToStaticMarkup(<SkipLink href="#report">Tới báo cáo</SkipLink>)).toContain(
      'href="#report"',
    );
  });
});
