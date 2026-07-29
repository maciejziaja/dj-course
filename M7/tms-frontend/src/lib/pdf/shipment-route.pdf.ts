import { PdfDocumentSpec } from './pdf.model'
import { sanitizeFilenamePart } from './pdf.format'

export interface TrackingEvent {
  id: number | string
  status: string
  location: string
  timestamp: string
  description: string
}

export interface ShipmentInfo {
  id: string | number
  origin: string
  destination: string
  driver: string
  eta?: string
  status?: string
}

export function shipmentRouteToPdfSpec(shipment: ShipmentInfo, events: TrackingEvent[]): PdfDocumentSpec {
  return {
    title: `Shipment Route - #${shipment.id}`,
    filename: `Shipment_${sanitizeFilenamePart(String(shipment.id))}_Route.pdf`,
    blocks: [
      {
        kind: 'section',
        title: 'Route Overview',
        blocks: [
          { kind: 'field', label: 'From:', value: shipment.origin },
          { kind: 'field', label: 'To:', value: shipment.destination },
          { kind: 'field', label: 'Driver:', value: shipment.driver },
          { kind: 'field', label: 'ETA:', value: shipment.eta },
          { kind: 'field', label: 'Status:', value: shipment.status },
        ],
      },
      {
        kind: 'section',
        title: 'Timeline',
        blocks: [
          {
            kind: 'timeline',
            events: events.map((event) => ({
              status: event.status,
              location: event.location,
              timestamp: event.timestamp,
              description: event.description,
            })),
          },
        ],
      },
    ],
  }
}
