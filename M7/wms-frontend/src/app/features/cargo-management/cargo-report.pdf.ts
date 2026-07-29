import { InventoryItem } from '../inventory/inventory.model'
import { CargoEvent, CargoLocationHistory, CargoDocument } from './cargo.model'
import { PdfDocumentSpec } from '../../lib/pdf/pdf.model'
import { formatCurrency, formatDate, formatDateTime, sanitizeFilenamePart } from '../../lib/pdf/pdf.format'

export interface CargoReportData extends InventoryItem {
  events?: CargoEvent[]
  locationHistory?: CargoLocationHistory[]
  documents?: CargoDocument[]
}

const REPORT_TYPE = 'Comprehensive Cargo Report'
const REPORT_NOTES =
  'This cargo report provides a comprehensive overview of the cargo item including its current status, ' +
  'location, physical attributes, and historical data. For more detailed information or updates, please ' +
  'access the warehouse management system.'

export function cargoReportToPdfSpec(cargoData: CargoReportData): PdfDocumentSpec {
  const now = new Date()

  return {
    title: `Cargo Report - ${cargoData.sku}`,
    subtitle: `Report Date: ${formatDate(now)}`,
    filename: `Cargo_Report_${sanitizeFilenamePart(cargoData.sku)}_${sanitizeFilenamePart(formatDate(now))}.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Basic Information',
        blocks: [
          { kind: 'field', label: 'SKU:', value: cargoData.sku },
          { kind: 'field', label: 'Name:', value: cargoData.name },
          { kind: 'field', label: 'Description:', value: cargoData.description },
          { kind: 'field', label: 'Category:', value: cargoData.category },
          { kind: 'field', label: 'Status:', value: cargoData.status.toUpperCase() },
        ],
      },
      {
        kind: 'section',
        title: 'Quantity & Storage',
        blocks: [
          { kind: 'field', label: 'Quantity:', value: `${cargoData.quantity} ${cargoData.unit}` },
          { kind: 'field', label: 'Location:', value: cargoData.location },
          { kind: 'field', label: 'Zone:', value: `${cargoData.zoneName} (Zone ID: ${cargoData.zoneId})` },
          {
            kind: 'field',
            label: 'Shelf Location:',
            value: `${cargoData.shelfLocation} (Shelf ID: ${cargoData.shelfId})`,
          },
        ],
      },
      {
        kind: 'section',
        title: 'Physical Attributes',
        blocks: [
          { kind: 'field', label: 'Weight:', value: `${cargoData.weight} kg` },
          { kind: 'field', label: 'Volume:', value: `${cargoData.volume} m³` },
          { kind: 'field', label: 'Value:', value: formatCurrency(cargoData.value, cargoData.currency) },
        ],
      },
      {
        kind: 'section',
        title: 'Additional Details',
        blocks: [
          { kind: 'field', label: 'Batch Number:', value: cargoData.batchNumber },
          { kind: 'field', label: 'Serial Number:', value: cargoData.serialNumber },
          {
            kind: 'field',
            label: 'Expiry Date:',
            value: cargoData.expiryDate ? formatDate(cargoData.expiryDate) : undefined,
          },
          { kind: 'field', label: 'Last Updated:', value: formatDateTime(cargoData.lastUpdated) },
        ],
      },
      ...(cargoData.contractorId && cargoData.contractorName
        ? [
            {
              kind: 'section' as const,
              title: 'Contractor Information',
              blocks: [
                { kind: 'field' as const, label: 'Contractor Name:', value: cargoData.contractorName },
                { kind: 'field' as const, label: 'Contractor ID:', value: cargoData.contractorId },
              ],
            },
          ]
        : []),
      ...(cargoData.events && cargoData.events.length > 0
        ? [
            {
              kind: 'section' as const,
              title: 'Event Timeline',
              blocks: [
                {
                  kind: 'table' as const,
                  columns: [
                    { header: 'Type', width: 30, align: 'left' as const },
                    { header: 'Title', width: 60, align: 'left' as const },
                    { header: 'Employee', width: 45, align: 'left' as const },
                    { header: 'Date', width: 35, align: 'left' as const },
                  ],
                  rows: cargoData.events.map((event) => [
                    event.type,
                    event.title,
                    event.employee,
                    formatDateTime(event.timestamp),
                  ]),
                },
              ],
            },
          ]
        : []),
      ...(cargoData.locationHistory && cargoData.locationHistory.length > 0
        ? [
            {
              kind: 'section' as const,
              title: 'Location History',
              blocks: [
                {
                  kind: 'table' as const,
                  columns: [
                    { header: 'Location', width: 60, align: 'left' as const },
                    { header: 'Details', width: 55, align: 'left' as const },
                    { header: 'Date', width: 30, align: 'left' as const },
                    { header: 'Duration', width: 25, align: 'left' as const },
                  ],
                  rows: cargoData.locationHistory.map((history) => [
                    history.location,
                    history.details,
                    formatDate(history.movedDate),
                    history.duration,
                  ]),
                },
              ],
            },
          ]
        : []),
      ...(cargoData.documents && cargoData.documents.length > 0
        ? [
            {
              kind: 'section' as const,
              title: 'Documentation',
              blocks: [
                {
                  kind: 'table' as const,
                  columns: [
                    { header: 'Document Name', width: 70, align: 'left' as const },
                    { header: 'Type', width: 30, align: 'left' as const },
                    { header: 'Size', width: 30, align: 'left' as const },
                    { header: 'Upload Date', width: 40, align: 'left' as const },
                  ],
                  rows: cargoData.documents.map((document) => [
                    document.name,
                    document.type,
                    document.size,
                    formatDate(document.uploadDate),
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
          { kind: 'field', label: 'Report Generated:', value: formatDateTime(now) },
          { kind: 'field', label: 'Report Type:', value: REPORT_TYPE },
          { kind: 'field', label: 'Notes:', value: REPORT_NOTES },
        ],
      },
    ],
  }
}
