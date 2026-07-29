import type { PdfDocumentSpec } from '~/lib/pdf/pdf.model'
import { formatCurrency, formatDate, sanitizeFilenamePart } from '~/lib/pdf/pdf.format'
import type { Invoice } from './billing.model'

export function invoiceToPdfSpec(invoice: Invoice): PdfDocumentSpec {
  return {
    title: 'Invoice',
    filename: `Invoice_${sanitizeFilenamePart(invoice.number)}.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Invoice Details',
        blocks: [
          { kind: 'field', label: 'Invoice Number:', value: invoice.number },
          { kind: 'field', label: 'Invoice ID:', value: String(invoice.id) },
          { kind: 'field', label: 'Description:', value: invoice.description },
          { kind: 'field', label: 'Amount:', value: formatCurrency(invoice.amount) },
          { kind: 'field', label: 'Status:', value: invoice.status },
          { kind: 'field', label: 'Invoice Date:', value: formatDate(invoice.date) },
          { kind: 'field', label: 'Due Date:', value: formatDate(invoice.dueDate) },
        ],
      },
    ],
  }
}
