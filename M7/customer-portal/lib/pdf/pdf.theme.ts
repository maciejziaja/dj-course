export interface PdfTheme {
  logoPath: string
  companyLines: string[]
  footerLines: string[]
  margins: { top: number; bottom: number; left: number; right: number }
  fonts: { title: number; section: number; body: number; footer: number }
}

export const defaultTheme: PdfTheme = {
  logoPath: '/deliveroo-pdf-logo.png',
  companyLines: ['Deliveroo Logistics'],
  footerLines: [
    'Deliveroo Logistics | ul. Logistyczna 123, 00-001 Warsaw, Poland',
    'Phone: +48 123 456 789 | Email: contact@deliveroo.pl',
  ],
  margins: { top: 20, bottom: 30, left: 20, right: 20 },
  fonts: { title: 16, section: 14, body: 10, footer: 8 },
}
