---
name: vsa-slice-refactor
description: >-
  Refactor one layer-based domain (its files scattered across src/http, src/hooks/queries,
  src/model, src/pages — or a screen that only consumes other domains' data) into a
  self-contained vertical slice under src/pages/<slice>/.
  Follows .claude/rules/vertical-slices.md, moves cross-slice coupling onto the event broker,
  verifies lint+build, and ends with a removability report. Use when consolidating a domain
  into one slice folder. Works one slice per run.
tools: Read, Edit, Write, Bash, Grep, Glob
---

# Vertical-slice refactor agent

Convert ONE domain from layer-based folders into a self-contained slice under
**`src/pages/<slice>/`**.

**Read `.claude/rules/vertical-slices.md` first** — it is the source of truth for the slice
layout (flat, suffix-named), the layer→slice move-map, what stays shared, the broker/events
rule, and the repo gotchas (the two query locations, `MOCK_MODE`, the `src/model/index.ts`
singleton, the `cn` / `@/` paths). This file is only the procedure.

## Scope

One slice per run unless told otherwise. This is a **behavior-preserving move-and-rewire**, not
a redesign — don't change UI, data shapes, or business logic. If a coupling can only be broken by
a behavior change, stop and call it out.

## Procedure

1. **Read the rule file** above (if you haven't this session).
2. **Map the slice.** With Grep/Glob, list every file for the domain across `src/http`,
   `src/hooks/queries`, `src/model`, `src/pages`, plus every file that imports them (the blast
   radius). Produce a move-table from the layer→slice map in the rule. If the domain has **no**
   files of its own in `src/http` / `src/model` (a *consumer slice* — see the rule), the
   move-table covers only `src/pages/*`, and the data layer is created by **copying** the
   fetch fns / hooks / types the screen consumes, per the rule's consumer-slice section.
3. **Classify each import** (inbound and outbound) as: internal (moves with the slice) / shared
   infra (stays) / other-domain data (copy into the slice per the consumer-slice rule) /
   cross-slice runtime coupling (becomes broker events).
4. **Plan + confirm.** Show the move-table, the cross-slice couplings you'll convert to events,
   and any global-state landmine (especially `src/model/index.ts`). Get the go-ahead before any
   destructive or ambiguous step.
5. **Move files** into `src/pages/<slice>/` (flat; suffix naming; subfolders only for sub-slices).
   Prefer `git mv` to keep history. Merge `src/http/<slice>.queries.ts` **and**
   `src/hooks/queries/use<Slice>*.ts` into one `<slice>.queries.ts`. Keep `MOCK_MODE` branching.
   Move the page wrapper into the folder as `<Slice>Page.tsx`. For a consumer slice, copy (don't
   move) the consumed fetch fns / hooks / types into the slice's own data files.
6. **Fix imports** in the moved files and every consumer — rewrite relative paths (`../../…`)
   to `@/`. Replace any existing `export *` barrel with a minimal `index.ts` exposing only what
   is imported externally (often just the `<Slice>Page`).
7. **Convert cross-slice couplings to events** via the broker (`usePublish` / `useSubscribe`).
   Remove the now-dead shared globals you replaced. If step 3 found no runtime couplings, this
   step is legitimately empty — report "zero couplings → zero events"; don't invent topics.
8. **Update `src/AppRoutes.tsx`** and any lazy imports to the new paths.
9. **Verify:** `npm run lint` and `npm run build` must pass; run any `tests/*.spec.ts` /
   `features/*.feature` covering this slice. Don't report green unless it is.
10. **Remove stumps:** delete the emptied `src/http/<slice>.*`, `src/model/<slice>/`,
    `src/hooks/queries/use<Slice>*.ts`, and any dead routes / utils / redirects / globals.
    Shared hooks/types you only **copied** stay in place while other screens still import them
    — note them as remaining shared code, not stumps.
11. **Removability report** (always end with this):
    - estimated compile errors if the slice folder were deleted (stop counting at ~10);
    - stumps left behind, or "none";
    - broker topics the slice publishes / subscribes to (its full connecting surface);
    - shared-infra imports remaining (expected: auth, http config, broker, ui lib);
    - anything you couldn't decouple and why, with a recommendation.

## Guardrails

- Incremental and verified — lint + build green before you say "done"; state plainly if a test
  failed or was skipped.
- Don't widen a shared UI primitive for one slice; customize at the slice.
- Don't over-DRY — duplicating domain/presentational code into the slice is the intended outcome.
- Leave Playwright `tests/` and Cucumber `features/` where they are unless told the feature team
  owns e2e.
- No `git commit` / `push` unless asked.
