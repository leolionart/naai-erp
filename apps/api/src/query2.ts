import { Pool } from "pg";
const pool = new Pool({ connectionString: "postgresql://admin:admin@localhost:5432/naai_erp" });
async function run() {
  const exps = await pool.query(
    "SELECT mapped_data FROM workbook_import_review_rows WHERE status = 'posted' AND kind = 'expense' LIMIT 5;",
  );
  console.log("Expenses WB:", exps.rows);
  await pool.end();
}
run().catch(console.error);
