import { Invoice } from './billing.model'

export const DEFAULT_INVOICE_TAX_RATE = 0.085 // 8.5%

export interface InvoiceTotals {
  subtotal: number
  taxRate: number
  tax: number
  total: number
}

/**
 * Aggregation logic for an invoice's monetary totals. Lives outside the PDF mapper
 * (`invoice.pdf.ts`) per the "no business logic in mappers" rule — the mapper only
 * formats these already-computed numbers.
 */
export function computeInvoiceTotals(invoice: Pick<Invoice, 'items'>, taxRate = DEFAULT_INVOICE_TAX_RATE): InvoiceTotals {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.totalPrice, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax
  return { subtotal, taxRate, tax, total }
}
