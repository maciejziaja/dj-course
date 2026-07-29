import { Invoice } from '../../features/billing-payments/billing.model'

export interface FinancialStatusBreakdownRow {
  label: string
  count: number
  revenue: number
}

export interface FinancialTopContractor {
  contractorId: string
  name: string
  total: number
  count: number
}

export interface FinancialRevenueMetrics {
  paidRevenue: number
  overdueRevenue: number
  pendingRevenue: number
  draftRevenue: number
}

/**
 * Aggregation logic for the financial report's derived metrics. Lives outside the PDF
 * mapper (`financial-report.pdf.ts`) per the "no business logic in mappers" rule — the
 * mapper only formats these already-computed values.
 */
export function computeRevenueByStatus(invoices: Invoice[]): FinancialRevenueMetrics {
  const sumByStatus = (status: Invoice['status']): number =>
    invoices.filter((inv) => inv.status === status).reduce((sum, inv) => sum + inv.amount, 0)

  return {
    paidRevenue: sumByStatus('paid'),
    overdueRevenue: sumByStatus('overdue'),
    pendingRevenue: sumByStatus('sent'),
    draftRevenue: sumByStatus('draft'),
  }
}

export function computeStatusBreakdown(invoices: Invoice[], revenue: FinancialRevenueMetrics): FinancialStatusBreakdownRow[] {
  const countByStatus = (status: Invoice['status']): number => invoices.filter((inv) => inv.status === status).length

  return [
    { label: 'Paid', count: countByStatus('paid'), revenue: revenue.paidRevenue },
    { label: 'Sent', count: countByStatus('sent'), revenue: revenue.pendingRevenue },
    { label: 'Overdue', count: countByStatus('overdue'), revenue: revenue.overdueRevenue },
    { label: 'Draft', count: countByStatus('draft'), revenue: revenue.draftRevenue },
  ]
}

export function computeTopContractors(invoices: Invoice[], limit = 5): FinancialTopContractor[] {
  const contractorRevenue = new Map<string, FinancialTopContractor>()

  invoices.forEach((invoice) => {
    const existing = contractorRevenue.get(invoice.contractorId)
    if (existing) {
      existing.total += invoice.amount
      existing.count += 1
    } else {
      contractorRevenue.set(invoice.contractorId, {
        contractorId: invoice.contractorId,
        name: invoice.contractorName,
        total: invoice.amount,
        count: 1,
      })
    }
  })

  return Array.from(contractorRevenue.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export function computeRecentInvoices(invoices: Invoice[], limit = 10): Invoice[] {
  return [...invoices]
    .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
    .slice(0, limit)
}

export function computeTotalAccounts(invoices: Invoice[]): number {
  return new Set(invoices.map((inv) => inv.contractorId)).size
}
