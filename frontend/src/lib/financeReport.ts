import type { FinancialEntry } from "../types";

export interface FinancePeriod {
  year: number | null;
  month: number | null;
}

export interface FinanceAmounts {
  income: number;
  expense: number;
  pending: number;
  overdue: number;
  overdueCount: number;
  balance: number;
}

export interface FinanceReportRow extends FinanceAmounts {
  entry: FinancialEntry;
}

export interface FinanceReport extends FinanceAmounts {
  rows: FinanceReportRow[];
}

function cents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

function matchesPeriod(date: string, period: FinancePeriod): boolean {
  if (period.year === null) return true;
  if (Number(date.slice(0, 4)) !== period.year) return false;
  return period.month === null || Number(date.slice(5, 7)) === period.month;
}

export function financialYears(entries: FinancialEntry[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const entry of entries) {
    years.add(Number(entry.entry_date.slice(0, 4)));
    for (const installment of entry.installments) {
      years.add(Number(installment.due_date.slice(0, 4)));
      if (installment.received_date) years.add(Number(installment.received_date.slice(0, 4)));
    }
  }
  return [...years].filter(Number.isFinite).sort((a, b) => b - a);
}

export function buildFinanceReport(
  entries: FinancialEntry[],
  period: FinancePeriod,
  today: string,
): FinanceReport {
  const rows: FinanceReportRow[] = [];
  let income = 0;
  let expense = 0;
  let pending = 0;
  let overdue = 0;
  let overdueCount = 0;

  for (const entry of entries) {
    const row: FinanceReportRow = {
      entry, income: 0, expense: 0, pending: 0, overdue: 0, overdueCount: 0, balance: 0,
    };
    if (entry.kind === "despesa") {
      if (matchesPeriod(entry.entry_date, period)) row.expense = cents(entry.amount);
    } else if (!entry.is_installment) {
      if (matchesPeriod(entry.entry_date, period)) row.income = cents(entry.amount);
    } else {
      for (const installment of entry.installments) {
        const amount = cents(installment.amount);
        if (installment.status === "recebida") {
          // Alguns backups antigos não guardam a data do recebimento.
          const receivedDate = installment.received_date ?? installment.due_date;
          if (matchesPeriod(receivedDate, period)) row.income += amount;
        } else if (matchesPeriod(installment.due_date, period)) {
          row.pending += amount;
          if (installment.due_date < today) {
            row.overdue += amount;
            row.overdueCount += 1;
          }
        }
      }
    }
    row.balance = row.income - row.expense;
    if (row.income || row.expense || row.pending) rows.push(row);
    income += row.income;
    expense += row.expense;
    pending += row.pending;
    overdue += row.overdue;
    overdueCount += row.overdueCount;
  }

  return { rows, income, expense, pending, overdue, overdueCount, balance: income - expense };
}
