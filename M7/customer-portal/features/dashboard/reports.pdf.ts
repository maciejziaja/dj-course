import type { PdfDocumentSpec } from '~/lib/pdf/pdf.model'
import { formatCurrency, formatDate, formatNumber } from '~/lib/pdf/pdf.format'
import type { Metrics, RoutePerformance } from './dashboard.model'

export interface ReportsData {
  dateRange: {
    from: string
    to: string
  }
  metrics: Metrics
  routePerformance: RoutePerformance[]
}

export function reportsToPdfSpec(reportsData: ReportsData): PdfDocumentSpec {
  const fromDateStr = reportsData.dateRange.from.replace(/-/g, '')
  const toDateStr = reportsData.dateRange.to.replace(/-/g, '')

  return {
    title: 'Logistics Report',
    filename: `Logistics_Report_${fromDateStr}_${toDateStr}.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Report Period',
        blocks: [
          {
            kind: 'field',
            label: 'Period:',
            value: `${formatDate(reportsData.dateRange.from)} - ${formatDate(reportsData.dateRange.to)}`,
          },
        ],
      },
      {
        kind: 'section',
        title: 'Key Metrics',
        blocks: [
          { kind: 'field', label: 'Total Shipments:', value: String(reportsData.metrics.totalShipments) },
          { kind: 'field', label: 'On-Time Delivery:', value: `${reportsData.metrics.onTimeDelivery.toFixed(1)}%` },
          { kind: 'field', label: 'Total Cost:', value: formatCurrency(reportsData.metrics.totalCost, 'EUR') },
          {
            kind: 'field',
            label: 'Storage Volume:',
            value: `${formatNumber(reportsData.metrics.storageVolume)} m³`,
          },
        ],
      },
      {
        kind: 'section',
        title: 'Route Performance',
        blocks: [
          {
            kind: 'table',
            columns: [
              { header: 'Route', width: 55 },
              { header: 'Shipments', width: 25, align: 'right' },
              { header: 'On-Time %', width: 28, align: 'right' },
              { header: 'Avg Cost', width: 30, align: 'right' },
              { header: 'Revenue', width: 32, align: 'right' },
            ],
            rows: reportsData.routePerformance.map((route) => [
              route.route,
              String(route.shipments),
              `${route.onTimePercentage}%`,
              formatCurrency(route.avgCost, 'EUR', { maximumFractionDigits: 0 }),
              formatCurrency(route.totalRevenue, 'EUR', { maximumFractionDigits: 0 }),
            ]),
          },
        ],
      },
    ],
  }
}
