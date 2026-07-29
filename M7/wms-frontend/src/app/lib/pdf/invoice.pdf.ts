import { Invoice } from '../../features/billing-payments/billing.model'
import { PdfDocumentSpec } from './pdf.model'
import { formatCurrency, formatDate, sanitizeFilenamePart } from './pdf.format'
import { InvoiceTotals } from '../../features/billing-payments/invoice.util'

export interface InvoiceCompanyInfo {
  name: string
  address: string
  city: string
  phone: string
  email: string
}

export interface InvoiceContractorInfo {
  address: string
  city: string
  email: string
}

const DEFAULT_COMPANY_INFO: InvoiceCompanyInfo = {
  name: 'Warehouse Management System',
  address: '123 Industrial Blvd',
  city: 'Chicago, IL 60601',
  phone: '+1-555-0100',
  email: 'billing@wms.com',
}

const DEFAULT_PAYMENT_TERMS = 'Net 30 days'
const DEFAULT_PAYMENT_METHODS = 'Bank Transfer: Account #123-456-789 or Check: Payable to "WMS Inc."'
const DEFAULT_NOTES =
  'Thank you for your business! Please remit payment within 30 days of the invoice date. ' +
  'For any questions regarding this invoice, please contact our billing department at billing@wms.com.'

export interface InvoiceForPdf extends Invoice {
  /** Already-computed subtotal/tax/total — aggregation lives in features/billing-payments/invoice.util.ts */
  totals: InvoiceTotals
  companyInfo?: InvoiceCompanyInfo
  contractorInfo?: InvoiceContractorInfo
  paymentTerms?: string
  notes?: string
}

function defaultContractorInfo(contractorName: string): InvoiceContractorInfo {
  return {
    address: '123 Business Ave',
    city: 'Business City, BC 12345',
    email: `contact@${contractorName.toLowerCase().replace(/\s+/g, '')}.com`,
  }
}

export function invoiceToPdfSpec(data: InvoiceForPdf): PdfDocumentSpec {
  const company = data.companyInfo ?? DEFAULT_COMPANY_INFO
  const contractor = data.contractorInfo ?? defaultContractorInfo(data.contractorName)
  const { subtotal, taxRate, tax, total } = data.totals

  return {
    title: `Invoice - ${data.invoiceNumber}`,
    filename: `Invoice_${sanitizeFilenamePart(data.invoiceNumber)}.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Invoice Information',
        blocks: [
          { kind: 'field', label: 'Invoice Number:', value: data.invoiceNumber },
          { kind: 'field', label: 'Status:', value: data.status.toUpperCase() },
          { kind: 'field', label: 'Issue Date:', value: formatDate(data.issueDate) },
          { kind: 'field', label: 'Due Date:', value: formatDate(data.dueDate) },
        ],
      },
      {
        kind: 'section',
        title: 'From',
        blocks: [
          { kind: 'field', label: 'Company:', value: company.name },
          { kind: 'field', label: 'Address:', value: company.address },
          { kind: 'field', label: 'City:', value: company.city },
          { kind: 'field', label: 'Phone:', value: company.phone },
          { kind: 'field', label: 'Email:', value: company.email },
        ],
      },
      {
        kind: 'section',
        title: 'Bill To',
        blocks: [
          { kind: 'field', label: 'Contractor:', value: data.contractorName },
          { kind: 'field', label: 'Contractor ID:', value: data.contractorId },
          { kind: 'field', label: 'Address:', value: contractor.address },
          { kind: 'field', label: 'City:', value: contractor.city },
          { kind: 'field', label: 'Email:', value: contractor.email },
        ],
      },
      {
        kind: 'section',
        title: 'Invoice Items',
        blocks: [
          {
            kind: 'table',
            columns: [
              { header: 'Description', width: 80, align: 'left' },
              { header: 'Qty', width: 30, align: 'right' },
              { header: 'Unit Price', width: 30, align: 'right' },
              { header: 'Total', width: 30, align: 'right' },
            ],
            rows: data.items.map((item) => [
              item.description,
              item.quantity.toString(),
              formatCurrency(item.unitPrice),
              formatCurrency(item.totalPrice),
            ]),
          },
        ],
      },
      {
        kind: 'section',
        title: 'Summary',
        blocks: [
          { kind: 'field', label: 'Subtotal:', value: formatCurrency(subtotal) },
          { kind: 'field', label: 'Tax:', value: `${formatCurrency(tax)} (${(taxRate * 100).toFixed(1)}%)` },
          { kind: 'field', label: 'Total Amount:', value: formatCurrency(total) },
        ],
      },
      {
        kind: 'section',
        title: 'Payment Information',
        blocks: [
          { kind: 'field', label: 'Payment Terms:', value: data.paymentTerms ?? DEFAULT_PAYMENT_TERMS },
          { kind: 'field', label: 'Payment Methods:', value: DEFAULT_PAYMENT_METHODS },
        ],
      },
      {
        kind: 'section',
        title: 'Notes',
        blocks: [{ kind: 'field', label: 'Additional Information:', value: data.notes ?? DEFAULT_NOTES }],
      },
    ],
  }
}
