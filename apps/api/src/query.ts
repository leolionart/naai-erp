import { Pool } from "pg";
const pool = new Pool({ connectionString: "postgresql://admin:admin@localhost:5432/naai_erp" });
async function run() {
  const res = await pool.query(
    "SELECT * FROM journal_entries WHERE description LIKE '%lương%' LIMIT 5;",
  );
  console.log(res.rows);
  const exps = await pool.query("SELECT * FROM expenses LIMIT 5;");
  console.log("Expenses:", exps.rows);
  await pool.end();
}
run().catch(console.error);
