# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TMS (Transportation Management System) frontend — a Lovable-generated Vite + React 18 + TypeScript SPA using shadcn-ui (Radix) + Tailwind. It manages shipments, orders, drivers, vehicles, documents, expenses, payments, claims/incidents, and route planning.

The app currently runs **fully mock-driven with no live backend** (see Mock mode below). Changes pushed here also sync to Lovable.

## Commands

```bash
npm run dev            # Vite dev server on :5173 (VITE_PORT is unset → Vite default)
npm run dev:local      # Port 4002, expects API at http://localhost:4001
npm run build          # Production build
npm run build:dev      # Build in development mode
npm run lint           # ESLint over the repo
npm run storybook      # Storybook on :6006 (stories live in src/components/ui/*.stories.tsx)

# E2E (Playwright, tests/ dir) — auto-starts `npm run dev` on :5173 and reuses a running one
npm run test:e2e
npx playwright test tests/urgent-items.spec.ts          # single spec file
npx playwright test -g "name of test"                   # single test by title
npm run test:e2e:chromium   # or :firefox / :webkit to pick a browser project
npm run test:e2e:ui         # interactive runner

# BDD (Cucumber, features/ dir; steps in features/step_definitions/)
npm run test:cucumber
npm run test:cucumber -- features/documents-management.feature   # single feature
```

There is **no unit-test runner wired up** — `vitest` is present only via the Storybook a11y/test addon. "Tests" means Playwright specs (`tests/`) and Cucumber features (`features/`).

## Architecture

### Vertical slices (migration in progress)
This codebase is being refactored from the layer-based folders described below into **vertical slices** under `src/pages/<slice>/` — one screen and everything it needs, in one flat folder. The conventions (slice layout, the layer→slice move-map, what stays shared, and events-over-shared-state) live in a dedicated rule, imported here so they stay in context:

@.claude/rules/vertical-slices.md

To perform a refactor, use the **`vsa-slice-refactor`** subagent. The layer-based sections below still describe today's pre-migration state.

### Data layer — per-domain vertical slices in `src/http/`
Each domain follows a fixed four-file convention:
- `*.http.ts` — async fetch functions. Every function branches on `MOCK_MODE`: it returns mock data (with a simulated `delay()`) in mock mode, otherwise does a real `fetch(\`${API_BASE_URL}...\`, { headers: getAuthHeaders() })`.
- `*.queries.ts` — TanStack Query hooks (`useQuery`/`useMutation`) wrapping the `*.http.ts` functions.
- `*.model.ts` — TypeScript types for the domain.
- `*.mocks.ts` — mock data and mock mutators.

`API_BASE_URL` is hardcoded in `src/http/http.config.ts` (`http://localhost:3030/api/`). The global query client (`src/App.tsx`) sets `staleTime: 5min`, `retry: false`.

### Mock mode
`MOCK_MODE = true` in `src/http/mock-utils.ts` is the master switch — flipping it to `false` makes every `*.http.ts` hit the real backend. **Two parallel sets of mock helpers coexist** (a known inconsistency; some files import both):
- `mock-utils.ts` → `MOCK_MODE`, `delay(min, max)`
- `http-utils.ts` → `simulateNetworkDelay()`, `simulateApiError(rate, msg)`, `createApiResponse()`

### Query hooks live in two places (inconsistency)
Both `src/http/*.queries.ts` and `src/hooks/queries/*.ts` define TanStack Query hooks that wrap the same `src/http/*.http.ts` functions. When adding a hook, match the pattern already used by the feature you're touching rather than assuming one canonical location.

### Model layer — `src/model/`
Domain types + mocks for shipments/drivers/vehicles/documents/expenses, separate from the HTTP `*.model.ts` files. Note `src/model/index.ts` runs **side-effectful module initialization**: it builds vehicle/driver document-entities and calls `setVehicleEntities`/`setDriverEntities` into a mutable singleton consumed by the documents model. Importing from `@/model` triggers this wiring.

### Auth
- `src/auth/AuthContext.tsx` — mock auth. Any credentials succeed; the user is stored in `localStorage` under the key `deliveroo_user`. `useAuth()` exposes `user/login/logout/isLoading`.
- `src/auth/session.token.ts` — the bearer token is a **Jotai atom** (`sessionTokenAtom`). `getAuthHeaders()` reads it from the default Jotai store (`getDefaultStore()`), so it works outside React.

### Routing
`src/AppRoutes.tsx` defines all routes. `/login` is public; everything else is nested under `ProtectedLayout` (`ProtectedRoute` → `Layout` → `<Outlet/>`). `Layout` provides the Header + Sidebar shell.

### In-app message broker
`src/lib/broker/` is a lightweight pub/sub. A single shared `MessageBroker` instance backs the `useSubscribe(topic, listener)` / `usePublish(topic)` hooks for cross-component eventing.

### Other libs of note
`src/lib/pdf/` (jsPDF/html2canvas generators for receipts, documents, shipment routes), `src/lib/date/`, Leaflet/react-leaflet maps in route planning, recharts for dashboard KPIs.

## Conventions & gotchas

- **Path alias:** `@/` → `src/` (configured in `vite.config.ts` and `tsconfig.json`).
- **`cn` lives at `@/lib/tailwind/utils`, NOT the shadcn-default `@/lib/utils`** (which does not exist). `components.json` still points `utils` at `@/lib/utils`, so `npx shadcn add <component>` generates a broken import — fix it to `@/lib/tailwind/utils` after adding any component.
- **TypeScript is intentionally loose:** `strictNullChecks: false`, `noImplicitAny: false`, unused locals/params off (`tsconfig.json`). Don't rely on null-safety from the compiler.
- **ESLint** flags `no-console` and `no-debugger` as warnings; `@typescript-eslint/no-unused-vars` is off.
- shadcn primitives are in `src/components/ui/` (~60 components); app-level shared components sit directly in `src/components/`.
- `Dockerfile` runs the **dev** server (`npm run dev --host 0.0.0.0` on :5173), not a production build.
