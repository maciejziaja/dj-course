export interface PdfColumn {
  header: string
  width?: number
  align?: 'left' | 'center' | 'right'
}

export interface PdfTimelineEvent {
  status: string
  location: string
  timestamp: string
  description: string
  isLast?: boolean
}

export type PdfBlock =
  | { kind: 'section'; title: string; blocks: PdfBlock[] }
  | { kind: 'field'; label: string; value?: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; columns: PdfColumn[]; rows: string[][] }
  | { kind: 'timeline'; events: PdfTimelineEvent[] }
  | { kind: 'spacer'; height: number }

export interface PdfDocumentSpec {
  title: string
  subtitle?: string
  filename: string
  watermark?: string
  blocks: PdfBlock[]
}
