import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  process.stdout.write("Configured Git hooks from .githooks.\n");
} catch {
  process.stdout.write("Git worktree not available; hook setup skipped.\n");
}
