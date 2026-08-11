import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { PageShell } from "./page-shell";
import { SkipLink } from "./skip-link";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("server-compatible layout primitives", () => {
  it("renders a skip target and semantic main content without client state", () => {
    const html = renderToStaticMarkup(
      <PageShell navigation={<aside aria-label="Điều hướng">Navigation</aside>}>
        <p>Nội dung</p>
      </PageShell>,
    );
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('data-slot="sidebar-inset"');
    expect(html).toContain("min-w-0");
    expect(html).toContain("overflow-x-clip");
    expect(html).toContain('aria-label="Điều hướng"');
  });

  it("renders accessible breadcrumbs, page status and actions", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <PageHeader
          title="Sổ kế toán"
          description="Journal và báo cáo"
          breadcrumbs={[{ label: "Admin", href: "/" }, { label: "Sổ kế toán" }]}
          status={<span>Đã đồng bộ</span>}
          actions={<button>Thêm journal</button>}
        />
      </SidebarProvider>,
    );
    expect(html).toContain('aria-label="breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Thêm journal");
    expect(html).toContain("Đã đồng bộ");
    expect(html).toContain("flex-wrap");
    expect(html).toContain("min-h-14");
  });

  it("allows a custom skip target", () => {
    expect(renderToStaticMarkup(<SkipLink href="#report">Tới báo cáo</SkipLink>)).toContain(
      'href="#report"',
    );
  });
});
