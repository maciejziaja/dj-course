import { BillingOverview, Invoice } from '../../features/billing-payments/billing.model'
import { PdfDocumentSpec } from './pdf.model'
import { formatCurrency, formatDate, sanitizeFilenamePart } from './pdf.format'
import { FinancialRevenueMetrics, FinancialStatusBreakdownRow, FinancialTopContractor } from '../../features/billing-payments/financial-report.util'

const REPORT_NOTES =
  'This financial report provides a comprehensive overview of billing and payment activities. ' +
  'For detailed invoice information, please refer to individual invoice documents.'

export interface FinancialReportForPdf {
  overview: BillingOverview
  reportPeriod?: string
  /** Already-computed aggregates — see features/billing-payments/financial-report.util.ts */
  revenue: FinancialRevenueMetrics
  statusBreakdown: FinancialStatusBreakdownRow[]
  topContractors: FinancialTopContractor[]
  recentInvoices: Invoice[]
  totalAccounts: number
}

export function financialReportToPdfSpec(data: FinancialReportForPdf): PdfDocumentSpec {
  const now = new Date()
  const reportPeriod = data.reportPeriod ?? `As of ${formatDate(now)}`

  return {
    title: 'Financial Report',
    subtitle: reportPeriod,
    filename: `Financial_Report_${sanitizeFilenamePart(formatDate(now))}.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Revenue Summary',
        blocks: [
          { kind: 'field', label: 'Total Revenue:', value: formatCurrency(data.overview.totalRevenue) },
          { kind: 'field', label: 'Total Invoices:', value: data.overview.totalInvoices.toString() },
          { kind: 'field', label: 'Paid Invoices:', value: data.overview.paidInvoices.toString() },
          { kind: 'field', label: 'Overdue Invoices:', value: data.overview.overdueInvoices.toString() },
          { kind: 'field', label: 'Average Invoice Value:', value: formatCurrency(data.overview.avgInvoiceValue) },
        ],
      },
      {
        kind: 'section',
        title: 'Performance Metrics',
        blocks: [
          { kind: 'field', label: 'Average Payment Time:', value: `${data.overview.avgPaymentTime} days` },
          { kind: 'field', label: 'Collection Rate:', value: `${data.overview.collectionRate.toFixed(1)}%` },
          { kind: 'field', label: 'Paid Revenue:', value: formatCurrency(data.revenue.paidRevenue) },
          { kind: 'field', label: 'Overdue Revenue:', value: formatCurrency(data.revenue.overdueRevenue) },
          { kind: 'field', label: 'Pending Revenue:', value: formatCurrency(data.revenue.pendingRevenue) },
        ],
      },
      {
        kind: 'section',
        title: 'Invoice Status Breakdown',
        blocks: [
          {
            kind: 'table',
            columns: [
              { header: 'Status', width: 60, align: 'left' },
              { header: 'Count', width: 40, align: 'left' },
              { header: 'Revenue', width: 70, align: 'right' },
            ],
            rows: data.statusBreakdown.map((row) => [row.label, row.count.toString(), formatCurrency(row.revenue)]),
          },
        ],
      },
      ...(data.topContractors.length > 0
        ? [
            {
              kind: 'section' as const,
              title: 'Top 5 Contractors by Revenue',
              blocks: [
                {
                  kind: 'table' as const,
                  columns: [
                    { header: 'Contractor', width: 90, align: 'left' as const },
                    { header: 'Invoices', width: 40, align: 'left' as const },
                    { header: 'Total Revenue', width: 40, align: 'right' as const },
                  ],
                  rows: data.topContractors.map((contractor) => [
                    contractor.name,
                    contractor.count.toString(),
                    formatCurrency(contractor.total),
                  ]),
                },
              ],
            },
          ]
        : []),
      ...(data.recentInvoices.length > 0
        ? [
            {
              kind: 'section' as const,
              title: 'Recent Invoices (Last 10)',
              blocks: [
                {
                  kind: 'table' as const,
                  columns: [
                    { header: 'Invoice #', width: 40, align: 'left' as const },
                    { header: 'Contractor', width: 45, align: 'left' as const },
                    { header: 'Date', width: 30, align: 'left' as const },
                    { header: 'Status', width: 25, align: 'left' as const },
                    { header: 'Amount', width: 30, align: 'right' as const },
                  ],
                  rows: data.recentInvoices.map((invoice) => [
                    invoice.invoiceNumber,
                    invoice.contractorName,
                    formatDate(invoice.issueDate),
                    invoice.status.toUpperCase(),
                    formatCurrency(invoice.amount),
                  ]),
                },
              ],
            },
          ]
        : []),
      {
        kind: 'section',
        title: 'Report Summary',
        blocks: [
          { kind: 'field', label: 'Report Generated:', value: formatDate(now) },
          { kind: 'field', label: 'Total Accounts:', value: data.totalAccounts.toString() },
          { kind: 'field', label: 'Notes:', value: REPORT_NOTES },
        ],
      },
    ],
  }
}
