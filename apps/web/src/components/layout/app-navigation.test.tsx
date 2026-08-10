import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./app-navigation.tsx", import.meta.url), "utf8");

describe("collapsed sidebar submenu", () => {
  it("uses the shared HoverCard pointer grace area instead of custom hover timers", () => {
    expect(source).toContain('from "@/components/ui/hover-card"');
    expect(source).toContain("<HoverCard openDelay={100} closeDelay={300}>");
    expect(source).toContain("<HoverCardTrigger asChild>");
    expect(source).toContain("<HoverCardContent");
    expect(source).not.toContain("setTimeout(");
    expect(source).not.toContain("onMouseEnter");
    expect(source).not.toContain("onMouseLeave");
  });

  it("keeps collapsed submenu destinations keyboard discoverable", () => {
    expect(source).toContain("aria-label={item.label}");
    expect(source).toContain('<nav className="flex flex-col gap-0.5" aria-label={item.label}>');
    expect(source).toContain('aria-current={childActive ? "page" : undefined}');
  });
});
