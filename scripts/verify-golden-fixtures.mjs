import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(root, "tests", "fixtures", "golden");
const requiredFiles = [
  "README.md",
  "input.json",
  "expected-journals.csv",
  "expected-allocations.csv",
  "expected-tax-view.csv",
  "oracle-manual.md",
];

const exact = {
  "GF-EXPENSE-001": {
    journal: [
      ["1", "debit", "642-OPEX", "3000000", "", "ALLOC-PETTY-ADMIN", "costCenter:ADMIN"],
      ["2", "credit", "111-CASH", "", "3000000", "", ""],
    ],
    allocations: [["ALLOC-PETTY-ADMIN", "costCenter:ADMIN", "3000000", "0", "3000000"]],
    tax: [
      ["management", "valid", "3000000", "3000000", "0", "0"],
      ["cit", "ineligible", "3000000", "0", "3000000", "0"],
      ["vat", "ineligible", "0", "0", "0", "0"],
    ],
  },
  "GF-EXPENSE-002": {
    journal: [
      ["1", "debit", "642-OPEX", "10000000", "", "ALLOC-PROJECT-A", "project:A"],
      ["2", "debit", "1331-VAT", "1000000", "", "ALLOC-PROJECT-A", "project:A"],
      ["3", "debit", "642-OPEX", "6000000", "", "ALLOC-PROJECT-B", "project:B"],
      ["4", "debit", "1331-VAT", "600000", "", "ALLOC-PROJECT-B", "project:B"],
      ["5", "debit", "642-OPEX", "4000000", "", "ALLOC-INTERNAL", "costCenter:INTERNAL"],
      ["6", "debit", "1331-VAT", "400000", "", "ALLOC-INTERNAL", "costCenter:INTERNAL"],
      ["7", "credit", "331-AP", "", "22000000", "", ""],
    ],
    allocations: [
      ["ALLOC-PROJECT-A", "project:A", "10000000", "1000000", "11000000"],
      ["ALLOC-PROJECT-B", "project:B", "6000000", "600000", "6600000"],
      ["ALLOC-INTERNAL", "costCenter:INTERNAL", "4000000", "400000", "4400000"],
    ],
    tax: [
      ["management", "valid", "20000000", "20000000", "0", "0"],
      ["cit", "eligible", "20000000", "20000000", "0", "0"],
      ["vat", "eligible", "2000000", "2000000", "0", "0"],
    ],
  },
};

function text(path) {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function csv(path) {
  return text(path)
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function same(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} differs from reviewed exact rows`,
  );
}

for (const [fixtureId, expected] of Object.entries(exact)) {
  const directory = join(fixtureRoot, fixtureId);
  const manifestRows = text(join(directory, "SHA256SUMS"))
    .trimEnd()
    .split("\n")
    .map((line) => line.match(/^([0-9a-f]{64}) {2}(.+)$/))
    .map((match) => {
      assert(match, `${fixtureId} has malformed SHA256SUMS row`);
      return [match[2], match[1]];
    });
  same(
    manifestRows.map(([name]) => name).sort(),
    [...requiredFiles].sort(),
    `${fixtureId} manifest file list`,
  );
  for (const [name, hash] of manifestRows) {
    assert(sha256(join(directory, name)) === hash, `${fixtureId}/${name} hash mismatch`);
  }

  const input = JSON.parse(text(join(directory, "input.json")));
  assert(input.fixtureId === fixtureId, `${fixtureId} input identity mismatch`);
  assert(
    BigInt(input.expense.grossMinor) ===
      BigInt(input.expense.netMinor) + BigInt(input.expense.vatMinor),
    `${fixtureId} gross control mismatch`,
  );

  const journal = csv(join(directory, "expected-journals.csv"));
  const allocations = csv(join(directory, "expected-allocations.csv"));
  const tax = csv(join(directory, "expected-tax-view.csv"));
  same(journal, expected.journal, `${fixtureId} journal`);
  same(allocations, expected.allocations, `${fixtureId} allocations`);
  same(tax, expected.tax, `${fixtureId} tax view`);

  const debit = journal.reduce((sum, row) => sum + BigInt(row[3] || "0"), 0n);
  const credit = journal.reduce((sum, row) => sum + BigInt(row[4] || "0"), 0n);
  assert(debit === credit, `${fixtureId} journal is not balanced`);
  assert(
    debit === BigInt(input.expense.grossMinor),
    `${fixtureId} journal does not match gross control`,
  );

  const allocationNet = allocations.reduce((sum, row) => sum + BigInt(row[2]), 0n);
  const allocationVat = allocations.reduce((sum, row) => sum + BigInt(row[3]), 0n);
  assert(
    allocationNet === BigInt(input.expense.netMinor),
    `${fixtureId} net allocations do not tie`,
  );
  assert(
    allocationVat === BigInt(input.expense.vatMinor),
    `${fixtureId} VAT allocations do not tie`,
  );
  for (const row of allocations) {
    assert(
      BigInt(row[4]) === BigInt(row[2]) + BigInt(row[3]),
      `${fixtureId} allocation gross mismatch`,
    );
  }

  if (fixtureId === "GF-EXPENSE-001") {
    const readme = text(join(directory, "README.md"));
    for (const term of [
      "Petty cash",
      "Freelancer",
      "Platform",
      "Overseas vendor",
      "Bank charges",
      "employee_reimbursement",
    ]) {
      assert(readme.includes(term), `${fixtureId} mapping convention missing ${term}`);
    }
  }

  console.log(`${fixtureId}: hashes, exact rows, balance, allocations and tax view verified`);
}

execFileSync(process.execPath, [join(fixtureRoot, "GF-BANK-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-TRANSFER-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-AGING-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-PROJECT-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-FORECAST-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-FORECAST-002", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-KPI-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-FINANCIAL-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-VAT-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-EQUITY-001", "verify.mjs")], {
  stdio: "inherit",
});

execFileSync(process.execPath, [join(fixtureRoot, "GF-EXPORT-001", "verify.mjs")], {
  stdio: "inherit",
});
