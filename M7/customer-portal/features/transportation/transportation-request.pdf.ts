import type { PdfBlock, PdfDocumentSpec } from '~/lib/pdf/pdf.model'
import { formatCurrency, formatDate, humanize, sanitizeFilenamePart } from '~/lib/pdf/pdf.format'

export interface TransportationRequestFormData {
  serviceType: string
  pickupLocation: {
    address: {
      street: string
      city: string
      postalCode?: string
      country: string
    }
    contactPerson: string
    contactPhone: string
    contactEmail?: string
    loadingType?: string
  }
  deliveryLocation: {
    address: {
      street: string
      city: string
      postalCode?: string
      country: string
    }
    contactPerson: string
    contactPhone: string
    contactEmail?: string
    loadingType?: string
  }
  cargo: {
    description: string
    cargoType: string
    weight: number
    dimensions?: {
      length: number
      width: number
      height: number
      unit: string
    }
    packaging: string
    quantity: number
    unitType: string
    value: number
    currency: string
    fragile?: boolean
    stackable?: boolean
  }
  vehicleRequirements?: {
    vehicleType: string
  }
  requestedPickupDate: string | Date
  requestedDeliveryDate?: string | Date
  specialInstructions?: string
  requiresInsurance: boolean
  requiresCustomsClearance: boolean
  priority: string
  currency: string
  estimatedCost?: number
  finalCost?: number
  trackingNumber?: string
}

export interface TransportationRequestPdfOptions {
  requestNumber?: string
  status?: string
  createdAt?: Date | string
}

function formatAddress(address: { street: string; city: string; postalCode?: string; country: string }): string {
  return [address.street, address.city, address.postalCode, address.country].filter(Boolean).join(', ')
}

export function transportationRequestToPdfSpec(
  formData: TransportationRequestFormData,
  options: TransportationRequestPdfOptions = {}
): PdfDocumentSpec {
  const requestInfoBlocks: PdfBlock[] = [
    { kind: 'field', label: 'Request Number:', value: options.requestNumber },
    { kind: 'field', label: 'Status:', value: options.status ? humanize(options.status) : undefined },
    { kind: 'field', label: 'Service Type:', value: humanize(formData.serviceType) },
    { kind: 'field', label: 'Priority:', value: humanize(formData.priority) },
    { kind: 'field', label: 'Created:', value: options.createdAt ? formatDate(options.createdAt) : undefined },
  ]

  const pickupBlocks: PdfBlock[] = [
    { kind: 'field', label: 'Address:', value: formatAddress(formData.pickupLocation.address) },
    { kind: 'field', label: 'Contact Person:', value: formData.pickupLocation.contactPerson },
    { kind: 'field', label: 'Phone:', value: formData.pickupLocation.contactPhone },
    { kind: 'field', label: 'Email:', value: formData.pickupLocation.contactEmail },
    { kind: 'field', label: 'Requested Pickup Date:', value: formatDate(formData.requestedPickupDate) },
    {
      kind: 'field',
      label: 'Loading Type:',
      value: formData.pickupLocation.loadingType ? humanize(formData.pickupLocation.loadingType) : undefined,
    },
  ]

  const deliveryBlocks: PdfBlock[] = [
    { kind: 'field', label: 'Address:', value: formatAddress(formData.deliveryLocation.address) },
    { kind: 'field', label: 'Contact Person:', value: formData.deliveryLocation.contactPerson },
    { kind: 'field', label: 'Phone:', value: formData.deliveryLocation.contactPhone },
    { kind: 'field', label: 'Email:', value: formData.deliveryLocation.contactEmail },
    {
      kind: 'field',
      label: 'Requested Delivery Date:',
      value: formData.requestedDeliveryDate ? formatDate(formData.requestedDeliveryDate) : undefined,
    },
    {
      kind: 'field',
      label: 'Unloading Type:',
      value: formData.deliveryLocation.loadingType ? humanize(formData.deliveryLocation.loadingType) : undefined,
    },
  ]

  const cargoBlocks: PdfBlock[] = [
    { kind: 'paragraph', text: formData.cargo.description },
    { kind: 'field', label: 'Cargo Type:', value: humanize(formData.cargo.cargoType) },
    { kind: 'field', label: 'Weight:', value: `${formData.cargo.weight} kg` },
    {
      kind: 'field',
      label: 'Dimensions:',
      value: formData.cargo.dimensions
        ? `${formData.cargo.dimensions.length} × ${formData.cargo.dimensions.width} × ${formData.cargo.dimensions.height} ${formData.cargo.dimensions.unit}`
        : undefined,
    },
    { kind: 'field', label: 'Packaging:', value: humanize(formData.cargo.packaging) },
    { kind: 'field', label: 'Quantity:', value: `${formData.cargo.quantity} ${formData.cargo.unitType}` },
    {
      kind: 'field',
      label: 'Estimated Value:',
      value: formData.cargo.value > 0 ? formatCurrency(formData.cargo.value, formData.cargo.currency || 'EUR') : undefined,
    },
    {
      kind: 'field',
      label: 'Fragile:',
      value: formData.cargo.fragile !== undefined ? (formData.cargo.fragile ? 'Yes' : 'No') : undefined,
    },
    {
      kind: 'field',
      label: 'Stackable:',
      value: formData.cargo.stackable !== undefined ? (formData.cargo.stackable ? 'Yes' : 'No') : undefined,
    },
  ]

  const serviceRequirementsBlocks: PdfBlock[] = [
    {
      kind: 'field',
      label: 'Vehicle Type:',
      value: formData.vehicleRequirements ? humanize(formData.vehicleRequirements.vehicleType) : undefined,
    },
    { kind: 'field', label: 'Requires Insurance:', value: formData.requiresInsurance ? 'Yes' : 'No' },
    { kind: 'field', label: 'Requires Customs Clearance:', value: formData.requiresCustomsClearance ? 'Yes' : 'No' },
    { kind: 'field', label: 'Special Instructions:', value: formData.specialInstructions },
    { kind: 'field', label: 'Tracking Number:', value: formData.trackingNumber },
  ]

  const blocks: PdfBlock[] = [
    { kind: 'section', title: 'Request Information', blocks: requestInfoBlocks },
    { kind: 'section', title: 'Pickup Location', blocks: pickupBlocks },
    { kind: 'section', title: 'Delivery Location', blocks: deliveryBlocks },
    { kind: 'section', title: 'Cargo Information', blocks: cargoBlocks },
    { kind: 'section', title: 'Service Requirements', blocks: serviceRequirementsBlocks },
  ]

  if (formData.estimatedCost !== undefined || formData.finalCost !== undefined) {
    blocks.push({
      kind: 'section',
      title: 'Pricing',
      blocks: [
        {
          kind: 'field',
          label: 'Estimated Cost:',
          value:
            formData.estimatedCost !== undefined
              ? formatCurrency(formData.estimatedCost, formData.currency || 'EUR')
              : undefined,
        },
        {
          kind: 'field',
          label: 'Final Cost:',
          value:
            formData.finalCost !== undefined
              ? formatCurrency(formData.finalCost, formData.currency || 'EUR')
              : undefined,
        },
      ],
    })
  }

  const filename = options.requestNumber
    ? `Transportation_Request_${sanitizeFilenamePart(options.requestNumber)}.pdf`
    : `Transportation_Request_${new Date().toISOString().split('T')[0]}.pdf`

  return {
    title: 'Transportation Request',
    filename,
    blocks,
  }
}
