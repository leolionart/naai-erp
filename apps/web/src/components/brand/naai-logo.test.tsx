import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NaaiLogo, NaaiMark } from "./naai-logo";

describe("NAAI brand assets", () => {
  it("renders a labelled mark for browser and assistive technology surfaces", () => {
    const html = renderToStaticMarkup(<NaaiMark title="NAAI ERP" />);
    expect(html).toContain('role="img"');
    expect(html).toContain("NAAI ERP");
    expect(html).toContain("d9f99d");
  });

  it("shares the NAAI ERP wordmark while supporting compact shells", () => {
    const full = renderToStaticMarkup(<NaaiLogo />);
    const compact = renderToStaticMarkup(<NaaiLogo compact />);
    expect(full).toContain("NAAI ERP");
    expect(full).toContain("Finance operations");
    expect(compact).not.toContain("Finance operations");
  });
});
