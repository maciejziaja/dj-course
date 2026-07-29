# PDF generation — conventions for this repo

All PDFs are produced by a 3-layer pipeline: a generic **engine** in `src/app/lib/pdf/` (per app)
plus per-domain **mappers** that live inside the feature module that uses them, not in
`lib/pdf/`. **Never call jsPDF directly outside the renderer.** A "generator" (mapper) is a pure
function from a domain object to a declarative `PdfDocumentSpec`; the renderer draws it.

## Layout

```
src/app/lib/pdf/              # engine — generic, no domain knowledge, shared infra
  pdf.model.ts      # PdfDocumentSpec + PdfBlock union (section/field/paragraph/table/timeline/spacer)
  pdf.theme.ts      # PdfTheme: logo path, company/footer lines, margins, font sizes + default theme
  pdf.renderer.ts   # renderPdf(spec, { theme?, output? }) — the ONLY file importing 'jspdf'
  pdf.format.ts     # formatDate, formatDateTime, formatCurrency, humanize (SNAKE_CASE → Title Case)

src/app/features/<feature>/<domain>.pdf.ts   # mapper, e.g. features/billing-payments/invoice.pdf.ts
```

Mappers are domain code, not infra: they import feature model/util types and are used by exactly
one feature, so they live in `src/app/features/<feature>/` next to the component that calls them,
named `<domain>.pdf.ts` and exporting `<domain>ToPdfSpec(data): PdfDocumentSpec`. Import the
engine from there via a relative path into `../../lib/pdf/...`.

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
2. Create `<domain>.pdf.ts` in the feature module that uses it, with `<domain>ToPdfSpec()`.
   Optional data ⇒ pass `undefined` to `field`, don't wrap in `if`.
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
- `src/app/lib/pdf/` (engine only) is shared infra — feature modules import it, never fork it.
  Mappers are the opposite: domain code owned by a single feature, living in that feature's
  folder, not in `lib/pdf/`. Deleting a feature should take its `<domain>.pdf.ts` with it and
  leave the engine untouched.

## Anti-patterns (all present in the legacy code — remove on touch)

Manual `yPos` bookkeeping outside the renderer · duplicated save/blob function pairs ·
per-document logo fetch · inline Intl formatters · `if (yPos + 10 > pageHeight - 30)` copy-paste ·
business aggregations inside a generator · magic layout numbers in domain code.
