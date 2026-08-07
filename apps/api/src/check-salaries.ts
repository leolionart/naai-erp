import { Pool } from "pg";
const pool = new Pool({ connectionString: "postgresql://admin:admin@localhost:5432/naai_erp" });
async function run() {
  const exps = await pool.query(
    "SELECT * FROM commercial_documents WHERE document_number LIKE 'WB-CP-%' LIMIT 5;",
  );
  console.log("Documents:", exps.rows);
  await pool.end();
}
run().catch(console.error);
