# Vertical slices — conventions for this repo

This codebase is moving from layer-based folders to **vertical slices**. A slice is
**one screen and everything it needs**, living in **`src/pages/<slice>/`**.

## Slice layout (flat)

All of a slice's files sit flat in `src/pages/<slice>/`; the filename **suffix** marks the
layer. Subfolders are only for **sub-slices** — a sub-feature with its own screen, e.g.
`orders/transportation-orders/` — **never** for grouping by type.

```
src/pages/drivers/
  DriversList.tsx  DriverTile.tsx  DriverFilters.tsx  DriverDetails.tsx   # UI components
  DriversPage.tsx                                                         # screen entry component(s)
  drivers.store.ts      # slice-local Jotai atoms — NOT global
  drivers.http.ts       # fetch fns; must branch on MOCK_MODE
  drivers.queries.ts    # ALL TanStack Query hooks for the slice
  drivers.model.ts      # slice-local domain types
  drivers.mocks.ts      # mock data + mutators
  drivers.events.ts     # (optional) broker topic names + payload types
  index.ts              # tiny barrel: export ONLY what routes/other code import
```

## Where each file comes from (layer → slice)

| Today (layer-based) | Goes to |
|---|---|
| `src/http/<slice>.http.ts` | `<slice>.http.ts` |
| `src/http/<slice>.queries.ts` **and** `src/hooks/queries/use<Slice>*.ts` | merge **both** into `<slice>.queries.ts` |
| `src/model/<slice>/*.types.ts` | `<slice>.model.ts` |
| `src/model/<slice>/<slice>.mocks.ts` (or `src/http/<slice>.mocks.ts`) | `<slice>.mocks.ts` |
| `src/pages/<slice>/*` + `src/pages/<Slice>Page.tsx` | the slice's components / screen entries |

The screen entry component is named `<Slice>Page.tsx` inside the slice folder. If today's wrapper
lives *next to* the folder (e.g. `src/pages/Foo.tsx` + `src/pages/foo/`), move it into the folder
and rename it to the `Page` suffix; only the route in `src/AppRoutes.tsx` should import it.

## Consumer slices (no data layer of their own)

Some screens have **no** `src/http/<slice>.*` or `src/model/<slice>/` files — they consume other
domains' hooks/types (e.g. via `src/hooks/queries` or `@/model/<other>`). The move-map above then
has nothing to move, but the slice is still not done. Apply "duplicate domain code, not
infrastructure":

- Create the slice's **own** `<slice>.queries.ts` + `<slice>.http.ts` with copies of just the
  fetch fns / query hooks it uses (keep `MOCK_MODE` branching and shared mock data imports).
  Do **not** move or delete the shared hooks — other screens still use them; delete them only
  once no screen imports them.
- Copy the types the slice uses into `<slice>.model.ts`. If a type clearly belongs to *this*
  screen but happens to live in another domain's model file, move it here and leave a
  re-export (or update the few external users) — don't keep importing it cross-domain.
- Distinct query keys per slice are fine; identical keys are also fine if the data is truly
  the same server resource.

## Stays shared — do NOT copy into slices

Slices duplicate *domain* code, not infrastructure. Import these; never fork them per slice:

- **Auth/session:** `src/auth/*` (`getAuthHeaders`, `useAuth`, `sessionTokenAtom`)
- **HTTP plumbing:** `src/http/http.config.ts`, `src/http/mock-utils.ts`, `src/http/http-utils.ts`
- **Event broker:** `src/lib/broker/*` (`useSubscribe`, `usePublish`)
- **UI library:** `src/components/ui/*` and shell `src/components/layout/*` — keep it small; customize at the slice, don't widen a primitive's API
- **Generic libs:** `src/lib/date/`, `src/lib/pdf/`

## Cross-slice talk = events, not imports

A slice must **not** import another slice's store/model/http. If slice A needs B, A publishes
or subscribes through the broker (`usePublish` / `useSubscribe` from `src/lib/broker/useBroker.ts`).
Shared topic names live in the slice's `*.events.ts`, or a tiny `src/lib/broker/topics.ts` when
two slices must agree on one. No hexagonal/ports/DI ceremony — just publish/subscribe.

If a slice has **no** runtime cross-slice couplings, it gets **no** events file and no topics —
"zero couplings → zero events" is a valid (and ideal) outcome; don't invent topics to have some.

## Repo gotchas

- **Merge the two query locations.** Hooks exist in both `src/http/*.queries.ts` and
  `src/hooks/queries/*.ts`. Collapse into the slice's `<slice>.queries.ts` and delete the leftovers.
- **Keep `MOCK_MODE` branching** intact when moving `*.http.ts`.
- **`src/model/index.ts` runs side-effectful init** — it calls `setVehicleEntities` /
  `setDriverEntities` into a singleton consumed by the documents model. That's a global-state
  coupling and a removal stump. When touching drivers/vehicles/documents, replace it with events
  or slice-local data; don't leave an orphaned global behind.
- Path alias `@/` → `src/`. `cn` is at `@/lib/tailwind/utils` (NOT `@/lib/utils`).
- **Rewrite relative imports** (`../../model/...`, `../../lib/...`) to `@/` while moving files.
- **Trim `export *` barrels.** Existing `index.ts` files often re-export everything; the slice's
  barrel must export only what is actually imported from outside the slice (usually just the
  `<Slice>Page` component).

## Removability target

Deleting a slice folder should produce **few/zero compile errors** and leave **no stumps**
(dead routes, unused utils, blind redirects, orphaned globals). A slice's only connection to the
rest of the app should be the broker topics it publishes/subscribes to.

## Anti-patterns

Cross-slice state imports · grouping a slice's files by type into subfolders · over-DRY extraction
of non-domain helpers · widening a shared UI primitive to serve one slice · leaving orphaned
globals after a slice is deleted.
