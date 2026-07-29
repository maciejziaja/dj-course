import type { PdfBlock, PdfDocumentSpec } from '~/lib/pdf/pdf.model'
import { formatCurrency, formatDate, humanize, sanitizeFilenamePart } from '~/lib/pdf/pdf.format'

export interface WarehousingRequestPdfCargo {
  description: string
  cargoType: string
  packaging: string
  quantity: number
  unitType: string
  value?: number
  currency?: string
  weight?: number
  dimensions?: {
    length: number
    width: number
    height: number
    unit: string
  }
}

export interface WarehousingRequestPdfData {
  requestNumber?: string
  status?: string
  priority: string
  storageType: string
  createdAt?: Date | string
  estimatedVolume: number
  estimatedWeight: number
  securityLevel: string
  storageLocation?: string
  plannedStartDate: Date | string
  plannedEndDate?: Date | string
  estimatedStorageDuration: {
    value: number
    unit: string
  }
  billingType: string
  cargo: WarehousingRequestPdfCargo
  handlingServices: string[]
  valueAddedServices: string[]
  requiresTemperatureControl: boolean
  requiresHumidityControl: boolean
  requiresSpecialHandling: boolean
  specialInstructions?: string
  estimatedCost?: number
  finalCost?: number
  currency?: string
}

function humanizeList(values: string[]): string | undefined {
  return values.length > 0 ? values.map((value) => humanize(String(value))).join(', ') : undefined
}

function isValidDate(value: Date | string): boolean {
  const d = value instanceof Date ? value : new Date(value)
  return !isNaN(d.getTime())
}

export function warehousingRequestToPdfSpec(data: WarehousingRequestPdfData): PdfDocumentSpec {
  const requestInfoBlocks: PdfBlock[] = [
    { kind: 'field', label: 'Request Number:', value: data.requestNumber },
    { kind: 'field', label: 'Status:', value: data.status ? humanize(data.status) : undefined },
    { kind: 'field', label: 'Storage Type:', value: humanize(data.storageType) },
    { kind: 'field', label: 'Priority:', value: humanize(data.priority) },
    {
      kind: 'field',
      label: 'Created:',
      value: data.createdAt && isValidDate(data.createdAt) ? formatDate(data.createdAt) : undefined,
    },
  ]

  const storageBlocks: PdfBlock[] = [
    { kind: 'field', label: 'Estimated Volume:', value: `${data.estimatedVolume} m³` },
    { kind: 'field', label: 'Estimated Weight:', value: `${data.estimatedWeight} kg` },
    { kind: 'field', label: 'Security Level:', value: humanize(data.securityLevel) },
    { kind: 'field', label: 'Storage Location:', value: data.storageLocation },
    {
      kind: 'field',
      label: 'Planned Start Date:',
      value: isValidDate(data.plannedStartDate) ? formatDate(data.plannedStartDate) : undefined,
    },
    {
      kind: 'field',
      label: 'Planned End Date:',
      value: data.plannedEndDate && isValidDate(data.plannedEndDate) ? formatDate(data.plannedEndDate) : undefined,
    },
    {
      kind: 'field',
      label: 'Storage Duration:',
      value: `${data.estimatedStorageDuration.value} ${data.estimatedStorageDuration.unit}`,
    },
    { kind: 'field', label: 'Billing Type:', value: humanize(data.billingType) },
  ]

  const cargoBlocks: PdfBlock[] = [
    { kind: 'paragraph', text: data.cargo.description || 'No description provided' },
    { kind: 'field', label: 'Cargo Type:', value: humanize(data.cargo.cargoType) },
    { kind: 'field', label: 'Packaging:', value: humanize(data.cargo.packaging) },
    { kind: 'field', label: 'Quantity:', value: `${data.cargo.quantity} ${data.cargo.unitType}` },
    {
      kind: 'field',
      label: 'Weight:',
      value: data.cargo.weight !== undefined ? `${data.cargo.weight} kg` : undefined,
    },
    {
      kind: 'field',
      label: 'Dimensions:',
      value: data.cargo.dimensions
        ? `${data.cargo.dimensions.length} × ${data.cargo.dimensions.width} × ${data.cargo.dimensions.height} ${data.cargo.dimensions.unit}`
        : undefined,
    },
    {
      kind: 'field',
      label: 'Estimated Value:',
      value:
        data.cargo.value && data.cargo.value > 0
          ? formatCurrency(data.cargo.value, data.cargo.currency || 'EUR')
          : undefined,
    },
  ]

  const serviceRequirementsBlocks: PdfBlock[] = [
    { kind: 'field', label: 'Handling Services:', value: humanizeList(data.handlingServices) },
    { kind: 'field', label: 'Value Added Services:', value: humanizeList(data.valueAddedServices) },
    { kind: 'field', label: 'Requires Temperature Control:', value: data.requiresTemperatureControl ? 'Yes' : 'No' },
    { kind: 'field', label: 'Requires Humidity Control:', value: data.requiresHumidityControl ? 'Yes' : 'No' },
    { kind: 'field', label: 'Requires Special Handling:', value: data.requiresSpecialHandling ? 'Yes' : 'No' },
    { kind: 'field', label: 'Special Instructions:', value: data.specialInstructions },
  ]

  const blocks: PdfBlock[] = [
    { kind: 'section', title: 'Request Information', blocks: requestInfoBlocks },
    { kind: 'section', title: 'Storage Information', blocks: storageBlocks },
    { kind: 'section', title: 'Cargo Information', blocks: cargoBlocks },
    { kind: 'section', title: 'Service Requirements', blocks: serviceRequirementsBlocks },
  ]

  if (data.estimatedCost !== undefined || data.finalCost !== undefined) {
    blocks.push({
      kind: 'section',
      title: 'Pricing',
      blocks: [
        {
          kind: 'field',
          label: 'Estimated Cost:',
          value: data.estimatedCost !== undefined ? formatCurrency(data.estimatedCost, data.currency || 'EUR') : undefined,
        },
        {
          kind: 'field',
          label: 'Final Cost:',
          value: data.finalCost !== undefined ? formatCurrency(data.finalCost, data.currency || 'EUR') : undefined,
        },
      ],
    })
  }

  const filename = data.requestNumber
    ? `Warehousing_Request_${sanitizeFilenamePart(data.requestNumber)}.pdf`
    : `Warehousing_Request_${new Date().toISOString().split('T')[0]}.pdf`

  return {
    title: 'Warehousing Request',
    filename,
    blocks,
  }
}
