# PDF generation — conventions for this repo

All PDFs are produced by a 3-layer pipeline in `src/app/lib/pdf/` (per app). **Never call jsPDF
directly outside the renderer.** A "generator" is a pure mapper from a domain object to a
declarative `PdfDocumentSpec`; the renderer draws it.

## Layout of `lib/pdf/`

```
src/app/lib/pdf/
  pdf.model.ts      # PdfDocumentSpec + PdfBlock union (section/field/paragraph/table/timeline/spacer)
  pdf.theme.ts      # PdfTheme: logo path, company/footer lines, margins, font sizes + default theme
  pdf.renderer.ts   # renderPdf(spec, { theme?, output? }) — the ONLY file importing 'jspdf'
  pdf.format.ts     # formatDate, formatDateTime, formatCurrency, humanize (SNAKE_CASE → Title Case)
  <domain>.pdf.ts   # e.g. invoice.pdf.ts — exports <domain>ToPdfSpec(data): PdfDocumentSpec
```

## The three layers

1. **Renderer (engine).** Owns the jsPDF instance, the y-cursor, `ensureSpace(h)` page-break
   logic, header (logo + company lines), watermark, footer with `Page i of n`. Logo is fetched
   once and cached module-level — never re-fetch per document.
2. **Blocks (document model).** A document is data, not a call sequence:
   - `section` — grey-bar heading + nested blocks; renderer keeps heading with first child (no orphans)
   - `field` — label/value pair; `value: undefined` ⇒ the block is silently skipped
     (this replaces every `if (data.x) { ...6 lines... }` copy-paste)
   - `paragraph` — wrapped long text
   - `table` — columns with width/align, rows as strings; renderer handles per-row page breaks
   - `timeline` — bullet + status/location/timestamp rows
3. **Mappers.** `<domain>ToPdfSpec()` is a pure sync function: formats values via `pdf.format.ts`,
   decides section order, computes the `filename`. **No jsPDF, no fetch, no coordinates.**

## Hard rules

- **One output path.** `renderPdf(spec)` saves; `renderPdf(spec, { output: 'blob' })` returns a
  Blob for preview. Never fork a generator into `...PDF` / `...PDFBlob` variants.
- **No magic numbers in mappers.** Margins, column x-positions, font sizes live in the theme or
  the renderer. If a mapper contains a coordinate, it's in the wrong layer.
- **No business logic in mappers.** Aggregations (revenue sums, top-N contractors, tax math)
  belong to the feature/domain layer; the mapper receives computed values.
- **Formatting is centralized.** Any `new Intl.NumberFormat`/`DateTimeFormat` or
  `replace(/_/g, ' ')` inline in a mapper is a smell — use `pdf.format.ts`.
- **Filenames** are built in the mapper: sanitize with `[^a-z0-9]/gi → '_'`, pattern
  `<Type>_<identifier>.pdf` (e.g. `Invoice_INV-2024-001.pdf`).
- Components call `renderPdf(<domain>ToPdfSpec(data))` and nothing else — a component importing
  `jspdf` is a bug.

## Adding a new PDF (checklist)

1. Check whether existing blocks cover the layout. Missing block kind? Extend the union +
   renderer once — do NOT hand-roll drawing in the mapper.
2. Create `<domain>.pdf.ts` with `<domain>ToPdfSpec()`. Optional data ⇒ pass `undefined` to
   `field`, don't wrap in `if`.
3. Unit-test the mapper as plain data: assert sections/labels/filename. No jsPDF mock needed.
4. Wire the trigger in the component with `renderPdf(...)`.

## Per-app notes

- Each app (tms-frontend, wms-frontend, customer-portal) keeps its **own copy** of `lib/pdf/`
  with its own theme. Logo path differs: tms-frontend serves it from `/deliveroo-pdf-logo.png`,
  wms-frontend from `/assets/deliveroo-pdf-logo.png` (this app's static assets live under
  `src/assets/`). Company/footer branding text is currently identical across apps. The engine
  is generic infra — identical by convention, not by shared package. If the engines drift, sync
  the renderer, not the mappers; `tms-frontend` migrated first and is the reference copy.
- This app is Angular (strict TypeScript: `strict`, `noPropertyAccessFromIndexSignature`,
  `noImplicitReturns` are all on) — the engine already compiles clean under this config, but
  keep that in mind if you port further changes from a looser sibling app.
- `src/app/lib/pdf/` is shared infra — feature modules import it, never fork it.

## Anti-patterns (all present in the legacy code — remove on touch)

Manual `yPos` bookkeeping outside the renderer · duplicated save/blob function pairs ·
per-document logo fetch · inline Intl formatters · `if (yPos + 10 > pageHeight - 30)` copy-paste ·
business aggregations inside a generator · magic layout numbers in domain code.
