import { PdfDocumentSpec } from '@/lib/pdf/pdf.model'
import { sanitizeFilenamePart } from '@/lib/pdf/pdf.format'

export interface PaymentReceiptData {
  id: string | number
  amount: string | number
  status: string
  method: string
  invoice?: string
  date: string
}

export function receiptToPdfSpec(payment: PaymentReceiptData): PdfDocumentSpec {
  return {
    title: 'Payment Receipt',
    filename: `Receipt_${sanitizeFilenamePart(String(payment.id))}.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Payment Details',
        blocks: [
          { kind: 'field', label: 'Payment ID', value: String(payment.id) },
          { kind: 'field', label: 'Amount', value: String(payment.amount) },
          { kind: 'field', label: 'Status', value: payment.status },
          { kind: 'field', label: 'Method', value: payment.method },
          { kind: 'field', label: 'Invoice', value: payment.invoice },
          { kind: 'field', label: 'Date', value: payment.date },
        ],
      },
    ],
  }
}
