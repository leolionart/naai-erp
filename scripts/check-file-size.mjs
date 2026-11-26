#!/usr/bin/env node
// BR-SIZE-001: source files stay <= 500 lines (blank lines and comments excluded, same as ESLint
// `max-lines` with skipBlankLines/skipComments). Files already above the limit are recorded in
// scripts/file-size-baseline.json and may only shrink.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_LINES = 500;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "snapshots",
  "__snapshots__",
  "fixtures",
  "migrations",
]);
const TEST_FILE = /\.(test|spec)\.[^.]+$/;
const SCAN_ROOTS = ["apps/*/src", "packages/*/src", "scripts"];

/** Counts lines that contain code, ignoring blank lines and comment-only lines. */
export function countCodeLines(source) {
  const lines = new Set();
  let line = 1;
  let state = "code"; // code | line | block | single | double | template
  const mark = () => lines.add(line);
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (char === "\n") {
      if (state === "line" || state === "single" || state === "double") state = "code";
      // Template literals and block comments continue across lines.
      if (state === "template") mark();
      line += 1;
      continue;
    }
    if (state === "line") continue;
    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        i += 1;
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      mark();
      if (char === "\\") {
        if (next === "\n") line += 1;
        i += 1;
      } else if (
        (state === "single" && char === "'") ||
        (state === "double" && char === '"') ||
        (state === "template" && char === "`")
      ) {
        state = "code";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      state = "line";
      i += 1;
    } else if (char === "/" && next === "*") {
      state = "block";
      i += 1;
    } else if (char === "'") {
      mark();
      state = "single";
    } else if (char === '"') {
      mark();
      state = "double";
    } else if (char === "`") {
      mark();
      state = "template";
    } else if (!/\s/.test(char)) {
      mark();
    }
  }
  return lines.size;
}

function expandRoots(root) {
  const resolved = [];
  for (const pattern of SCAN_ROOTS) {
    const [head, wildcard, ...rest] = pattern.split("/");
    if (wildcard === undefined) {
      resolved.push(join(root, head));
      continue;
    }
    const parent = join(root, head);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent)) {
      resolved.push(join(parent, entry, ...rest));
    }
  }
  return resolved.filter((path) => existsSync(path));
}

function walk(directory, files) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry)) walk(path, files);
    } else if (
      SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf("."))) &&
      !TEST_FILE.test(entry)
    ) {
      files.push(path);
    }
  }
}

export function measureSources(root) {
  const files = [];
  for (const directory of expandRoots(root)) walk(directory, files);
  const sizes = {};
  for (const file of files) {
    sizes[relative(root, file).split(sep).join("/")] = countCodeLines(readFileSync(file, "utf8"));
  }
  return sizes;
}

/** Returns the list of violations (empty when the ratchet holds). */
export function evaluate(sizes, baseline) {
  const errors = [];
  for (const [path, lines] of Object.entries(sizes)) {
    const recorded = baseline[path];
    if (recorded === undefined) {
      if (lines > MAX_LINES) {
        errors.push(`${path}: ${lines} lines exceeds ${MAX_LINES} and is not in the baseline`);
      }
    } else if (lines > recorded) {
      errors.push(
        `${path}: grew from ${recorded} to ${lines} lines; baselined files may only shrink`,
      );
    } else if (lines <= MAX_LINES) {
      errors.push(
        `${path}: now ${lines} lines; remove it from the baseline (npm run check:file-size -- --update)`,
      );
    } else if (lines < recorded) {
      errors.push(
        `${path}: shrank from ${recorded} to ${lines} lines; lower the baseline (--update)`,
      );
    }
  }
  for (const path of Object.keys(baseline)) {
    if (!(path in sizes))
      errors.push(`${path}: no longer exists; remove it from the baseline (--update)`);
  }
  return errors;
}

/** Builds the next baseline: only lowers entries or removes them, never adds or raises. */
export function ratchetBaseline(sizes, baseline) {
  const next = {};
  for (const [path, recorded] of Object.entries(baseline)) {
    const lines = sizes[path];
    if (lines === undefined || lines <= MAX_LINES) continue;
    next[path] = Math.min(recorded, lines);
  }
  return next;
}

export function createInitialBaseline(sizes) {
  return Object.fromEntries(
    Object.entries(sizes)
      .filter(([, lines]) => lines > MAX_LINES)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = resolve(
    rootIndex >= 0 ? args[rootIndex + 1] : join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const baselinePath = join(root, "scripts", "file-size-baseline.json");
  const sizes = measureSources(root);
  if (args.includes("--init")) {
    if (existsSync(baselinePath)) {
      console.error("Baseline already exists; --init refuses to overwrite it.");
      process.exit(1);
    }
    writeFileSync(baselinePath, `${JSON.stringify(createInitialBaseline(sizes), null, 2)}\n`);
    console.log("Baseline created.");
    return;
  }
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
  if (args.includes("--update")) {
    const next = ratchetBaseline(sizes, baseline);
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Baseline updated (${Object.keys(next).length} oversized files remain).`);
    return;
  }
  const errors = evaluate(sizes, baseline);
  if (errors.length > 0) {
    console.error(`File size check failed (BR-SIZE-001, limit ${MAX_LINES} code lines):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`File size check passed (${Object.keys(baseline).length} baselined files).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
