import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://naai_erp:naai_erp@localhost:5432/naai_erp",
  },
  strict: true,
  verbose: true,
});
