import jsPDF from 'jspdf'
import type { PdfBlock, PdfColumn, PdfDocumentSpec, PdfTimelineEvent } from './pdf.model'
import { defaultTheme } from './pdf.theme'
import type { PdfTheme } from './pdf.theme'

let cachedLogoDataUrl: string | null | undefined

async function loadLogo(logoPath: string): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl
  try {
    const response = await fetch(logoPath)
    const blob = await response.blob()
    cachedLogoDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.error('Failed to load PDF logo', err)
    cachedLogoDataUrl = null
  }
  return cachedLogoDataUrl
}

class PdfBuilder {
  readonly doc: jsPDF
  private y: number
  private readonly pageWidth: number
  private readonly pageHeight: number
  private readonly contentWidth: number

  constructor(private readonly theme: PdfTheme) {
    this.doc = new jsPDF()
    this.pageWidth = this.doc.internal.pageSize.getWidth()
    this.pageHeight = this.doc.internal.pageSize.getHeight()
    this.contentWidth = this.pageWidth - theme.margins.left - theme.margins.right
    this.y = theme.margins.top
  }

  private ensureSpace(height: number) {
    if (this.y + height > this.pageHeight - this.theme.margins.bottom) {
      this.doc.addPage()
      this.y = this.theme.margins.top
    }
  }

  drawHeader(logoDataUrl: string | null, title: string, subtitle?: string) {
    const { left } = this.theme.margins
    if (logoDataUrl) {
      this.doc.addImage(logoDataUrl, 'PNG', left, 15, 15, 15)
    }
    this.doc.setFontSize(this.theme.fonts.title)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(title, left, 35)

    this.doc.setFontSize(this.theme.fonts.body)
    this.doc.setFont('helvetica', 'normal')
    let lineY = 42
    for (const line of this.theme.companyLines) {
      this.doc.text(line, left, lineY)
      lineY += 6
    }
    if (subtitle) {
      this.doc.text(subtitle, left, lineY)
      lineY += 6
    }
    this.y = Math.max(55, lineY + 8)
  }

  drawWatermark(text: string) {
    this.doc.setFontSize(50)
    this.doc.setTextColor(200, 200, 200)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(text, this.pageWidth / 2, this.pageHeight / 2, { angle: 45, align: 'center' })
    this.doc.setTextColor(0, 0, 0)
  }

  drawSectionHeading(title: string) {
    const { left } = this.theme.margins
    this.ensureSpace(23)
    this.doc.setFontSize(this.theme.fonts.section)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFillColor(248, 250, 252)
    this.doc.rect(left, this.y, this.contentWidth, 8, 'F')
    this.doc.text(title, left + 2, this.y + 5.5)
    this.y += 15
  }

  drawField(label: string, value: string) {
    const { left } = this.theme.margins
    const labelColumnWidth = 40
    this.doc.setFontSize(this.theme.fonts.body)
    this.doc.setFont('helvetica', 'bold')
    const labelLines: string[] = this.doc.splitTextToSize(label, labelColumnWidth - 2)
    const valueLines: string[] = this.doc.splitTextToSize(value, this.contentWidth - labelColumnWidth)
    const rowLines = Math.max(labelLines.length, valueLines.length)
    this.ensureSpace(rowLines * 4 + 6)
    this.doc.text(labelLines, left, this.y)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(valueLines, left + labelColumnWidth, this.y)
    this.y += Math.max(rowLines * 4, 6) + 2
  }

  drawParagraph(text: string) {
    const { left } = this.theme.margins
    this.doc.setFontSize(this.theme.fonts.body)
    this.doc.setFont('helvetica', 'normal')
    const lines: string[] = this.doc.splitTextToSize(text, this.contentWidth)
    for (const line of lines) {
      this.ensureSpace(5)
      this.doc.text(line, left, this.y)
      this.y += 5
    }
  }

  drawSpacer(height: number) {
    this.y += height
  }

  drawTable(columns: PdfColumn[], rows: string[][]) {
    const { left } = this.theme.margins
    const colWidths = columns.map((col) => col.width ?? this.contentWidth / columns.length)
    const colLeft: number[] = []
    columns.reduce((x, _col, i) => {
      colLeft[i] = x
      return x + colWidths[i]
    }, left)
    const textX = (i: number, align: PdfColumn['align']) => {
      if (align === 'right') return colLeft[i] + colWidths[i]
      if (align === 'center') return colLeft[i] + colWidths[i] / 2
      return colLeft[i]
    }
    const rowHeight = 7

    this.ensureSpace(rowHeight)
    this.doc.setFontSize(this.theme.fonts.body)
    this.doc.setFont('helvetica', 'bold')
    columns.forEach((col, i) => {
      this.doc.text(col.header, textX(i, col.align), this.y, { align: col.align ?? 'left' })
    })
    this.y += rowHeight

    this.doc.setFont('helvetica', 'normal')
    for (const row of rows) {
      this.ensureSpace(rowHeight)
      row.forEach((cell, i) => {
        this.doc.text(cell, textX(i, columns[i]?.align), this.y, { align: columns[i]?.align ?? 'left' })
      })
      this.y += rowHeight
    }
  }

  drawTimeline(events: PdfTimelineEvent[]) {
    const { left } = this.theme.margins
    events.forEach((event, index) => {
      this.ensureSpace(14)
      const isLast = event.isLast ?? index === events.length - 1
      const fillColor: [number, number, number] = isLast ? [33, 150, 243] : [34, 197, 94]
      this.doc.setFillColor(...fillColor)
      this.doc.circle(left + 5, this.y, 2, 'F')

      this.doc.setFontSize(this.theme.fonts.body)
      this.doc.setFont('helvetica', 'bold')
      this.doc.text(event.status, left + 10, this.y)
      this.doc.setFont('helvetica', 'normal')
      this.doc.text(event.timestamp, left + 120, this.y)
      this.y += 4
      this.doc.setFontSize(9)
      this.doc.text(event.location, left + 10, this.y)
      this.y += 4
      this.doc.setTextColor(100, 100, 100)
      this.doc.text(event.description, left + 10, this.y)
      this.doc.setTextColor(0, 0, 0)
      this.y += 10
    })
  }

  drawFooter() {
    const { left, right } = this.theme.margins
    const pageCount = this.doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i)
      this.doc.setDrawColor(200, 200, 200)
      this.doc.line(left, this.pageHeight - 25, this.pageWidth - right, this.pageHeight - 25)
      this.doc.setFontSize(this.theme.fonts.footer)
      this.doc.setTextColor(100, 100, 100)
      this.theme.footerLines.forEach((line, idx) => {
        this.doc.text(line, left, this.pageHeight - 18 + idx * 6)
      })
      this.doc.text(`Page ${i} of ${pageCount}`, this.pageWidth - right - 20, this.pageHeight - 12)
      this.doc.setTextColor(0, 0, 0)
    }
  }
}

function renderBlock(builder: PdfBuilder, block: PdfBlock) {
  switch (block.kind) {
    case 'section':
      builder.drawSectionHeading(block.title)
      block.blocks.forEach((child) => renderBlock(builder, child))
      break
    case 'field':
      if (block.value === undefined) return
      builder.drawField(block.label, block.value)
      break
    case 'paragraph':
      builder.drawParagraph(block.text)
      break
    case 'table':
      builder.drawTable(block.columns, block.rows)
      break
    case 'timeline':
      builder.drawTimeline(block.events)
      break
    case 'spacer':
      builder.drawSpacer(block.height)
      break
  }
}

export async function renderPdf(
  spec: PdfDocumentSpec,
  opts: { theme?: PdfTheme; output?: 'save' | 'blob' } = {}
): Promise<Blob | void> {
  const theme = opts.theme ?? defaultTheme
  const logoDataUrl = await loadLogo(theme.logoPath)

  const builder = new PdfBuilder(theme)
  builder.drawHeader(logoDataUrl, spec.title, spec.subtitle)
  if (spec.watermark) builder.drawWatermark(spec.watermark)
  spec.blocks.forEach((block) => renderBlock(builder, block))
  builder.drawFooter()

  if (opts.output === 'blob') {
    return builder.doc.output('blob')
  }
  builder.doc.save(spec.filename)
}
