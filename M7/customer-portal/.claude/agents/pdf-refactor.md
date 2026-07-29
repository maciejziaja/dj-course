---
name: pdf-refactor
description: >-
  Migrate one legacy jsPDF generator (imperative yPos/copy-paste style) onto the declarative
  pdf pipeline (pdf.model / pdf.renderer / pdf.theme / pdf.format) described in
  .claude/rules/pdf-generation.md. Bootstraps the pipeline if it doesn't exist yet in the app.
  Behavior-preserving: same sections, same fields, same filename. One generator per run.
tools: Read, Edit, Write, Bash, Grep, Glob
---

# PDF refactor agent

Convert ONE legacy `lib/pdf/*PdfGenerator.ts` into a thin `<domain>ToPdfSpec()` mapper rendered by
the shared engine. **Read `.claude/rules/pdf-generation.md` first** — it defines the layers, block
catalogue, and hard rules. This file is only the procedure.

## Scope

One generator per run. This is a **behavior-preserving rewrite**: identical section order,
labels, optional-field behavior, and filename. Pixel-perfect spacing is NOT required — the
engine's consistent spacing wins over legacy magic numbers. Flag (don't silently change) any
real behavior difference.

## Procedure

1. **Bootstrap check.** If `lib/pdf/pdf.renderer.ts` doesn't exist in this app yet, create the
   four infra files (`pdf.model.ts`, `pdf.theme.ts`, `pdf.renderer.ts`, `pdf.format.ts`) per the
   rule. Copy from `tms-frontend` (the reference implementation, migrated first) rather than
   reinventing; only the theme is app-specific, and here it doesn't even need to change — this
   app's logo path (`/deliveroo-pdf-logo.png`) and footer lines already match `tms-frontend`'s
   defaults exactly. As of this writing the engine already exists here, so this step is normally
   a no-op — verify rather than skip blindly.
2. **Inventory the legacy generator.** List: sections in order; every label/value pair and its
   optionality; tables (columns, alignment); timelines; watermark/footer options; the filename
   formula; and any save/blob twin function (`generateXxxPDF` / `generateXxxPDFBlob`).
   **Known duplication in this app:** transportation and warehousing requests each have TWO
   independent legacy implementations — a standalone `transportationRequestPdfGenerator.ts` /
   `warehousingRequestPdfGenerator.ts` (used by listing/submit pages) AND a second, drifted copy
   as a method on the `PDFGenerator` object in `lib/pdf/pdfGenerator.ts` (used by the details
   pages). Diff the two before writing the mapper — migrating only one and leaving the other
   would keep dead duplicated code around and risks silently changing the details-page output.
3. **Extract business logic.** Aggregations computed inside the generator (e.g. report totals,
   top-N contractors, tax math) move to the feature's `*-api.ts` or a small
   `<domain>.pdf.helpers.ts` — the mapper only formats and arranges already-computed values.
4. **Write the mapper** `features/<feature>/<domain>.pdf.ts` → `<domain>ToPdfSpec()`. Optional
   legacy `if (x) {...}` blocks become `field` with possibly-undefined value. Inline Intl
   formatters become `pdf.format.ts` calls (add missing helpers there once, don't inline). Import
   the engine via `~/lib/pdf/...`.
5. **Missing block kind?** Extend `PdfBlock` + renderer once (e.g. `timeline` for shipment/
   tracking events). Never draw ad hoc in the mapper. Keep the union small — reuse before
   inventing; `table` and `timeline` are already exercised by the sibling apps' renderers, so
   reuse them as-is rather than reinventing.
6. **Rewire callers.** Replace `generateXxxPDF(data)` with `renderPdf(xxxToPdfSpec(data))`;
   replace `generateXxxPDFBlob` with `renderPdf(spec, { output: 'blob' })`. Grep across `.vue`
   files and `*-api.ts` for ALL call sites — legacy generators here are called from both page
   components and `*-api.ts` helpers (e.g. `billing-api.ts`, `dashboard-api.ts`), not only from
   `.vue` files.
7. **Delete the migrated generator function** from `lib/pdf/pdfGenerator.ts` (or the dedicated
   `*PdfGenerator.ts` file if the document type has its own). No deprecated re-exports left
   behind. Leave other, not-yet-migrated generators in place.
8. **Verify:** `npx nuxi typecheck` and `npm run build` must be green. This app has no lint script
   and no unit-test runner wired up (`vitest` is present only via the Storybook addon) — skip
   adding one, just note it in the report. Add a plain-data unit test for the mapper
   (sections/labels/filename) only if a test setup already exists for that feature.

## Report (always end with this)

- Block kinds used; block kinds added to the engine (should usually be zero);
- business logic moved out of the generator and where it went;
- call sites rewired (list files); legacy code deleted;
- any visual/behavioral difference vs legacy, with justification;
- whether this was the app's first migration (bootstrap happened here) — if so, note the engine
  is now also a sync point for sibling apps; if not, note anything you had to diverge from
  `tms-frontend`'s copy.

## Guardrails

- The mapper must contain **zero** coordinates, font sizes, page math, and `jspdf` imports.
- Don't merge two document types into one mapper "because they're similar" — one domain, one file.
- Don't create a cross-app shared package; each app keeps its own `lib/pdf/` copy.
- No `git commit` / `push` unless asked.
