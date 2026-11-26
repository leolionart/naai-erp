import { readFileSync } from "node:fs";
import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// BR-SIZE-001: files outside the baseline must stay <= 500 lines (error); baselined and test files only warn.
const oversizedBaseline = Object.keys(
  JSON.parse(readFileSync(new URL("./scripts/file-size-baseline.json", import.meta.url), "utf8")),
);
const maxLines = { max: 500, skipBlankLines: true, skipComments: true };

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      "pnpm-lock.yaml",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "max-lines": ["error", maxLines],
    },
  },
  {
    files: [...oversizedBaseline, "**/*.{test,spec}.{js,mjs,ts,tsx}"],
    rules: { "max-lines": ["warn", maxLines] },
  },
);
