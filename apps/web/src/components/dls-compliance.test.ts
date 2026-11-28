import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webSrcRoot = resolve(here, "..");
const repoRoot = resolve(webSrcRoot, "../../..");

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (full === join(webSrcRoot, "components", "ui")) continue;
      results.push(...collectSourceFiles(full));
    } else if (/\.(tsx|ts)$/.test(entry) && !/\.(test|spec)\.(tsx|ts)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe("T-UNIT-ERP-1012-001 Design Language System (DLS) compliance gate (BR-UI-008)", () => {
  const files = collectSourceFiles(webSrcRoot);

  it("prohibits raw <input> (except hidden/file), <select>, and <textarea> outside components/ui", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<(input|select|textarea)\b([^>]*)/g)) {
        const tag = match[1];
        const attrs = match[2] ?? "";
        if (tag === "input" && /\btype\s*=\s*["'](hidden|file)["']/.test(attrs)) {
          continue;
        }
        violations.push(`${rel}: raw <${tag}>`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("prohibits blocking browser window.confirm, window.prompt, and window.alert dialogs", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      if (/\bwindow\.(confirm|prompt|alert)\s*\(/.test(source)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  it("prohibits narrow max-w-md..max-w-2xl root containers on non-dialog workspaces", () => {
    const workspaceFiles = collectSourceFiles(join(webSrcRoot, "app", "workspaces"));
    const violations: string[] = [];
    for (const file of workspaceFiles) {
      const rel = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        if (
          line.includes("DialogContent") ||
          line.includes("PopoverContent") ||
          line.includes("SheetContent")
        ) {
          continue;
        }
        if (/<div[^>]*\bmax-w-(md|lg|xl|2xl)\b/.test(line)) {
          violations.push(`${rel}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("prohibits hardcoded dark-slate terminal surface overrides in workspaces", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      if (/\b(bg-slate-950|border-slate-800|text-slate-100)\b/.test(source)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps dedicated /settings/automation screen free of header popup AutomationApiDialog trigger", () => {
    const automationPage = readFileSync(
      join(webSrcRoot, "app", "(app)", "settings", "automation", "page.tsx"),
      "utf8",
    );
    expect(automationPage).not.toContain("actions={");
    expect(automationPage).not.toContain("<AutomationApiDialog");
  });

  it("documents ADR-013 and the canonical DLS specification", () => {
    const adr = readFileSync(
      join(
        repoRoot,
        "docs",
        "architecture",
        "ADR-013-design-language-system-and-interaction-standards.md",
      ),
      "utf8",
    );
    const spec = readFileSync(join(repoRoot, "docs", "design", "dls-specification.md"), "utf8");
    expect(adr).toContain("Status: Accepted");
    expect(adr).toContain("BR-UI-008");
    expect(spec).toContain("Switch");
    expect(spec).toContain("CardFooter");
  });
});
