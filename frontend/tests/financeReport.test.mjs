import assert from "node:assert/strict";
import test from "node:test";

import { buildFinanceReport, financialYears } from "../src/lib/financeReport.ts";

const entries = [
  { id: "1", kind: "receita", entry_date: "2025-12-20", amount: "100.00", is_installment: false, installments: [] },
  { id: "2", kind: "despesa", entry_date: "2026-01-10", amount: "10.25", is_installment: false, installments: [] },
  {
    id: "3", kind: "receita", entry_date: "2025-12-01", amount: "300.00", is_installment: true,
    installments: [
      { amount: "100.00", due_date: "2025-12-10", received_date: "2026-01-02", status: "recebida" },
      { amount: "100.00", due_date: "2026-01-15", received_date: null, status: "pendente" },
      { amount: "100.00", due_date: "2026-02-15", received_date: null, status: "pendente" },
    ],
  },
];

test("lançamento de dezembro recebido em janeiro entra no mês do recebimento", () => {
  const january = buildFinanceReport(entries, { year: 2026, month: 1 }, "2026-01-20");
  assert.equal(january.income, 10000);
  assert.equal(january.expense, 1025);
  assert.equal(january.balance, 8975);
  assert.equal(january.pending, 10000);
  assert.equal(january.overdueCount, 1);
  assert.deepEqual(january.rows.map((row) => row.entry.id), ["2", "3"]);
});

test("ano completo soma meses sem antecipar parcelas pendentes", () => {
  const year = buildFinanceReport(entries, { year: 2026, month: null }, "2026-01-20");
  assert.equal(year.income, 10000);
  assert.equal(year.pending, 20000);
  assert.equal(year.overdue, 10000);
  assert.deepEqual(financialYears(entries, 2026), [2026, 2025]);
});

test("todos os anos mantém os totais gerais", () => {
  const all = buildFinanceReport(entries, { year: null, month: null }, "2026-01-20");
  assert.equal(all.income, 20000);
  assert.equal(all.expense, 1025);
  assert.equal(all.pending, 20000);
});
