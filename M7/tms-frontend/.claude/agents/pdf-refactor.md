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

Convert ONE legacy `*PdfGenerator.ts` into a thin `<domain>ToPdfSpec()` mapper rendered by the
shared engine. **Read `.claude/rules/pdf-generation.md` first** — it defines the layers, block
catalogue, and hard rules. This file is only the procedure.

## Scope

One generator per run. This is a **behavior-preserving rewrite**: identical section order,
labels, optional-field behavior, and filename. Pixel-perfect spacing is NOT required — the
engine's consistent spacing wins over legacy magic numbers. Flag (don't silently change) any
real behavior difference.

## Procedure

1. **Bootstrap check.** If `lib/pdf/pdf.renderer.ts` doesn't exist in this app yet, create the
   four infra files (`pdf.model.ts`, `pdf.theme.ts`, `pdf.renderer.ts`, `pdf.format.ts`) per the
   rule. Copy from a sibling app if one already migrated — engines stay in sync. Theme gets this
   app's logo path and footer lines lifted from the legacy file.
2. **Inventory the legacy generator.** List: sections in order; every label/value pair and its
   optionality; tables (columns, alignment); timelines; watermark/footer options; the filename
   formula; and any save/blob twin function.
3. **Extract business logic.** Aggregations computed inside the generator (sums, top-N,
   tax) move to the calling feature or a small `<domain>.pdf.helpers.ts` — the mapper only
   formats and arranges.
4. **Write the mapper** `<domain>.pdf.ts` → `<domain>ToPdfSpec()`. Optional legacy `if (x) {...}`
   blocks become `field` with possibly-undefined value. Inline Intl formatters become
   `pdf.format.ts` calls (add missing helpers there once, don't inline).
5. **Missing block kind?** Extend `PdfBlock` + renderer once (e.g. `timeline` for shipment
   routes). Never draw ad hoc in the mapper. Keep the union small — reuse before inventing.
6. **Rewire callers.** Replace `generateXxxPDF(data)` with `renderPdf(xxxToPdfSpec(data))`;
   replace `generateXxxPDFBlob` with `renderPdf(spec, { output: 'blob' })`. Grep for ALL call
   sites including preview dialogs.
7. **Delete the legacy file.** No deprecated re-exports left behind.
8. **Verify:** app lint + build green; if the app has tests covering the trigger, run them.
   Add a plain-data unit test for the mapper (sections/labels/filename) if a test setup exists.

## Report (always end with this)

- Block kinds used; block kinds added to the engine (should usually be zero);
- business logic moved out of the generator and where it went;
- call sites rewired; legacy files deleted;
- any visual/behavioral difference vs legacy, with justification;
- if this was the app's first migration: note that the engine is now the sync point for
  sibling apps.

## Guardrails

- The mapper must contain **zero** coordinates, font sizes, page math, and `jspdf` imports.
- Don't merge two document types into one mapper "because they're similar" — one domain, one file.
- Don't create a cross-app shared package; each app keeps its own `lib/pdf/` copy.
- No `git commit` / `push` unless asked.
