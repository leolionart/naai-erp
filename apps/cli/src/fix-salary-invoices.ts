import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "dotenv";

config({ path: "../../.env" });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://admin:admin@localhost:5432/naai_erp",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Find all purchase_invoice commercial_documents that represent Salary (Chi phí lương)
    const salaryInvoices = await client.query(`
      SELECT d.id, d.journal_id, d.migration_source_expense_id
      FROM commercial_documents d
      JOIN commercial_document_lines l ON l.document_id = d.id
      WHERE d.type = 'purchase_invoice' 
        AND d.document_number LIKE 'WB-CP-%'
        AND l.description ILIKE '%lương%'
    `);

    console.log(`Found ${salaryInvoices.rowCount} salary invoices to revert.`);

    for (const row of salaryInvoices.rows) {
      const docId = row.id;
      const journalId = row.journal_id;
      const sourceExpenseId = row.migration_source_expense_id;

      if (!sourceExpenseId) continue;

      // 2. Delete the commercial_document and its lines
      await client.query(`DELETE FROM commercial_document_lines WHERE document_id = $1`, [docId]);
      await client.query(`DELETE FROM commercial_documents WHERE id = $1`, [docId]);

      // 3. Delete the journal entry for the purchase invoice
      if (journalId) {
        await client.query(`DELETE FROM journal_lines WHERE journal_id = $1`, [journalId]);
        await client.query(`DELETE FROM journal_entries WHERE id = $1`, [journalId]);
      }

      // 4. Delete the reversal journal of the original expense
      // The original journal ID is usually 'journal-expense-import-expense-<id>'
      // and the reversal is 'reversal-journal-expense-import-expense-<id>'
      const originalJournalRes = await client.query(
        `SELECT journal_id FROM expenses WHERE id = $1`,
        [sourceExpenseId],
      );

      if (originalJournalRes.rowCount && originalJournalRes.rowCount > 0) {
        const origJournalId = originalJournalRes.rows[0].journal_id;
        const reversalId = `reversal-${origJournalId}`;

        // Delete the reversal journal so the original expense is active again
        await client.query(`DELETE FROM journal_lines WHERE journal_id = $1`, [reversalId]);
        await client.query(`DELETE FROM journal_entries WHERE id = $1`, [reversalId]);

        // Update the original expense to be non_documented if needed
        await client.query(`UPDATE expenses SET expense_class = 'non_documented' WHERE id = $1`, [
          sourceExpenseId,
        ]);
      }

      console.log(`Reverted salary invoice ${docId} back to expense ${sourceExpenseId}`);
    }

    await client.query("COMMIT");
    console.log("Migration revert completed successfully.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Failed to revert salary invoices:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
