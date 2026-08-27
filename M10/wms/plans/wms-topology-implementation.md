# Warehouse Topology API — Implementation Plan

**Date:** 2026-08-27
**Status:** decisions closed (§2), implementation not started
**Design baseline:** `plans/wms-topology-api.md` (design closed)
**Out of scope here:** OpenAPI contract update (`openapi.yaml`), frontend

---

## 1. What the repo actually is (verified, not assumed)

| Fact | Consequence for the plan |
|---|---|
| `wms-api` is **Flask 3 + SQLAlchemy Core (`text()` SQL) + pydantic v2**. Blueprints live in `src/routes/*.py` and are registered in `src/application.py` with `url_prefix`. No ORM, no migration tool, no test suite, no linter | §10 "Stack" closes itself: Flask, raw SQL. The plan adds no new dependency |
| `src/contract/*.py` is **OpenAPI-generated** ("Do not edit the class manually") | Topology models go into a **new hand-written package `src/topology/`**. Nothing there collides with a future `openapi-generator` run |
| The DB is seeded from `postgres/init-scripts/wms-latest.sql`, which is produced by `wms-data-generator` and **inlines `schema/create-wms-schema.sql`**. Init scripts run **only on an empty volume** | `create-wms-schema.sql` is the single source of truth; the seed is regenerated from it. Refreshing a running DB therefore means **recreating the volume**, not migrating it (D6) |
| Live DB is up (`wms-postgres-container`, SMALL dataset): 7 zones, 7 aisles, 10 racks, 15 shelves, 22 reservations, 22 records | Enough data to exercise every branch. **4 of 15 shelves carry no trace at all** → both the `204` and the `409 has_history` path are testable on real data. The reseeded dataset has the same shape (same quantities, different ids) |
| Checked for duplicates on `(warehouse_id, name)`, `(zone_id, label)`, `(aisle_id, label)`, `(rack_id, level)` in the live data → **none** | Nothing in the current dataset contradicts the four unique indexes — the regenerated seed only has to keep it that way |
| `aisle.width_unit` / `rack.height_unit` currently hold `'cm'` everywhere | `CHECK (… IN ('mm','cm','m'))` passes on existing rows |
| **Generator bug found:** `generate_shelves` sets `rack_id = i % NUM_RACKS` and `level = (i % 4) + 1`. In LARGE mode (6000 shelves / 1200 racks) the stride is 1200, and `1200 % 4 == 0`, so **all 5 shelves of a rack get the same level** | `uq_shelf_level` would make LARGE generation fail. The generator must be fixed **in the same change** as the index. SMALL mode happens to be safe |
| Zone names are unique, but initials collide: *Picking Area* and *Packing Area* both → `PA` | The `zone.code` backfill needs collision handling, not a naive `initials()` |
| Existing labels contain dashes: `Aisle-1`, `R-001` | Dashes are the separator of the composed path `A-03-R02-L4` → see D8 |
| Flask cannot express `:generate` / `:bulk` through `url_prefix` (a prefix + rule always joins with `/`) | Topology blueprints register **full paths** and are mounted with **no `url_prefix`**. Existing blueprints stay as they are |

---

## 2. Decisions that close §10 of the design doc

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Stack | **Flask + SQLAlchemy Core + pydantic v2**, same as the rest of `wms-api` | Already the repo's stack; a second style would be the only real cost |
| D2 | Pagination | **Offset**: `?page=` (1-based) `&limit=` (default 50, max 500). Envelope `{ items, page, limit, total }` | The design doc already writes `?page=&limit=`; the topology is small and stable, so cursor pagination buys nothing |
| D3 | `location` | **`GET /locations`** (filters `city`, `country`, `q`, paginated) **+ inline creation** inside `POST /warehouses` (`location_id` *or* `location{…}`, exactly one). No `POST/PATCH/DELETE /locations` in v1 | Closes the option the design doc called "enough". A location has no children and nothing to cascade — a full CRUD would be pure ceremony |
| D4 | Units | **Hybrid, dictated by the schema.** `aisle.width` and `rack.max_height` have a unit column → the API takes `{value, unit}` with `unit ∈ mm\|cm\|m` and **stores it verbatim** (CHECK guards the column). `shelf.max_weight` / `max_volume` have **no** unit column → the API accepts `{value, unit}` and **normalises to kg / m³** on write, always returning `{value, unit:"kg"\|"m3"}` | Normalising everything would silently rewrite the existing `cm` rows; adding two unit columns to `shelf` is schema growth the API does not need. Where a unit column exists we honour it; where it does not, the base unit is documented in the schema comment |
| D5 | `DELETE` idempotency | **`404` on a repeated call** | Addressing is by surrogate id (D2 of the design doc). A repeated `DELETE /shelves/412` is not "the same intent again", it is a stale id — and the caller wants to know |
| D6 | Seed data | **Only `create-wms-schema.sql` is edited**; `wms-latest.sql` is regenerated from it with `task generate-sql-and-sync`. **No hand-written migration file** | One source of truth, and the seed file's own banner says so. The consequence: refreshing the local DB is `docker compose down -v` + `task run-wms` — destructive, but the data is generated and disposable. If a non-disposable environment ever appears, the same DDL as an `ALTER` script is a 20-line exercise |

### Deltas against the design doc (things the design left implicit)

| # | Delta | Rationale |
|---|---|---|
| D7 | **`naming` in `POST /layout` is not implementable as written.** §8 of the design says the path `A-03-R02-L4` is *composed in the response*, never stored — so a per-request template has nothing to write to. Proposal: the API composes codes with the fixed canonical format `{zone}-{aisle}-{rack}-L{level}`; the `naming` key is accepted but must equal that string, otherwise `400` with an explicit message | Better an honest `400` than a field that silently does nothing. If codes ever need to be stored, this becomes a real feature in one migration |
| D8 | **`-` is forbidden inside `zone.code`, `aisle.label`, `rack.label`, `shelf.level`** on write (`^[A-Za-z0-9_]{1,16}$`, level `{1,8}`) | The dash is the separator of the composed path. `A-03-R02-L4` must parse back unambiguously. Legacy rows (`Aisle-1`, `R-001`) stay as they are — addressing is by id, so the only cost is a visually ambiguous path until they are renamed. The regenerated seed will be dash-free (`A01`, `R001`) |
| D9 | **`count` / `per_aisle` / `per_rack` are optional cross-checks**, `labels` / `levels` are the source of truth. If both are given and disagree → `400` | The design doc shows both in one example. A redundant count that must match is exactly what catches a typo in a range |
| D10 | **`?dry_run=true` returns the same status the real call would return** — `409` with the full blocked payload when it would fail, `200 { would_delete }` when it would succeed | The point of `dry_run` is to predict the real call. A dry run that always answers `200` predicts nothing |
| D11 | Hard limits: ≤50 zones per layout call, ≤200 aisles/zone, ≤200 racks/aisle, ≤50 shelves/rack, **≤5000 shelves per request**, ≤5000 ids in `PATCH /shelves:bulk` | The design's own example is 800 shelves. A limit an order of magnitude above the use case turns a typo in a range from an outage into a `400` |

---

## 3. Phase 1 — schema and seed data

**3.1 `wms-data-generator/schema/create-wms-schema.sql`** (the source of truth for a fresh volume)

- `zone`: `+ code TEXT NOT NULL`
- `warehouse.description`, `zone.description`: `NOT NULL` → nullable
- `aisle.width_unit`, `rack.height_unit`: `+ CHECK (… IN ('mm','cm','m'))`
- `warehouse`, `zone`, `aisle`, `rack`, `shelf`: `+ created_at`, `+ updated_at` (`TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`)
- `+ uq_zone_code (warehouse_id, code)`, `uq_aisle_label (zone_id, label)`, `uq_rack_label (aisle_id, label)`, `uq_shelf_level (rack_id, level)`
- comment on `shelf`: `max_weight` in kg, `max_volume` in m³ (D4)
- `capacity` untouched (D7 of the design doc)

No migration file and no `ALTER` script (D6) — this file *is* the migration, applied by recreating the volume.

**3.2 `wms-data-generator/src/generators/warehouse_structure/warehouse_structure.py`**

- `ZONE_NAMES` gains explicit codes: `BULK, RECV, PICK, PACK, SHIP, RET, QC`; `zones_insert_sql` gains the `code` column
- aisle labels `A01…`, rack labels `R001…` (dash-free, D8) — so the seeded data addresses the same way the API writes it
- **`generate_shelves` rewritten to iterate `rack × level`** instead of `i % NUM_RACKS`, so `(rack_id, level)` is unique by construction in both modes (the LARGE-mode bug above)
- units stay `cm` — still valid under the new CHECK

**3.3 Regenerate:** `task generate-sql-and-sync` → `postgres/init-scripts/wms-latest.sql`. Expect a large diff: the file is a full random dataset, so every id and every generated value shifts.

**3.4 Refresh the local DB** — `docker compose down -v` (drops the `wms-postgres_data` volume, i.e. the current 15 shelves and 22 records) followed by `task run-wms`. **Destructive, so it runs only on your say-so** — I will stop and ask before touching the volume, or leave the command to you.

**Checkpoint 1:** the container comes up from the regenerated seed and `\d zone` shows `code` + `uq_zone_code`; `task generate-sql MODE=LARGE` completes, proving the shelf-level fix.

---

## 4. Phase 2 — the API layer

### 4.1 New package `wms-api/src/topology/` (no HTTP knowledge except `errors.py`)

| Module | Responsibility |
|---|---|
| `errors.py` | `ApiError(code, message, http_status, **extra)` + a Flask error handler rendering `{ "error": code, "message": …, …extra }`. One envelope for the whole topology API |
| `measures.py` | `Measure{value, unit}`, the three unit enums, `to_kg` / `to_m3` conversions (D4). Accepts a bare number as "already in the base unit" |
| `labels.py` | `expand("01..08") → ["01",…,"08"]` — prefix must match on both sides, zero-padding taken from the left operand; also accepts an explicit list. Enforces the D11 limits. The one piece with real edge cases, hence the `__main__` self-check (§7) |
| `schemas.py` | pydantic request bodies (`extra="forbid"`, so a typo in a key is a `400` and not a silent no-op): `WarehouseCreate/Patch`, `ZoneCreate/Patch`, `AisleCreate/Patch/Generate`, `RackCreate/…`, `ShelfCreate/Patch`, `ShelfBulkPatch`, `LayoutCreate` |
| `sql.py` | Shared SQL fragments: the `shelf → rack → aisle → zone → warehouse` join, the `code` expression `z.code‖'-'‖a.label‖'-'‖r.label‖'-L'‖s.level`, and a `SCOPES` map `level → (join, where)` so "all shelves under X" is written once |
| `repository.py` | Thin data access: `get_*`, `list_children`, `insert_*`, `patch_*` (dynamic `SET` from the pydantic `exclude_unset` dict + `updated_at = CURRENT_TIMESTAMP`), `counts_under`, and the layout bulk insert (multi-row `INSERT … RETURNING`, one transaction) |
| `deletion.py` | The entire delete logic from §7 of the design: `blocked_shelves(level, id)` → rows with `reservations`, `records`, `active_reservations`, `open_records`; classification `in_use` / `has_history`; `would_delete` counts; the cascading delete (children upward: shelf → rack → aisle → zone) in one transaction |
| `pagination.py` | `page`/`limit` parsing, `{ items, page, limit, total }` envelope |

### 4.2 New blueprints in `wms-api/src/routes/`

`locations.py`, `warehouses.py`, `zones.py`, `aisles.py`, `racks.py`, `shelves.py` — registered in `application.py` **without `url_prefix`** (Flask cannot build `/shelves:bulk` from a prefix). Existing routes and their registration are untouched.

> Note: the existing `warehouse_bp` is mounted at `/warehouse` (singular) and returns *employees* of a warehouse. The new `/warehouses` (plural) is a separate namespace — no collision, no change to the old endpoint. Worth a line in the README so nobody trips over the singular/plural pair.

### 4.3 Endpoint → implementation matrix

| Method + path | Core query / action | Statuses |
|---|---|---|
| `GET /locations` | filter `city`/`country`/`q` (ILIKE over address+city), paginated | 200 |
| `GET /warehouses` | `city`/`country`/`q`, join `location`, paginated | 200 |
| `GET /warehouses/{id}` | one row + embedded `location` | 200, 404 |
| `POST /warehouses` | `location_id` XOR inline `location{…}` (insert first, one tx) | 201, 400, 404 |
| `PATCH /warehouses/{id}` | dynamic `SET` (`name`, `description`, `location_id`) | 200, 400, 404 |
| `GET /warehouses/{id}/layout?depth=` | grouped tree; `counts{aisles,racks,shelves}` at every level, children only down to `depth` (default `zone`) | 200, 400, 404 |
| `POST /warehouses/{id}/layout?dry_run=` | expand labels → pre-check collisions → nested bulk insert, one tx | 201, 200 (dry run), 400, 404, 409 |
| `GET /warehouses/{id}/zones` · `POST …/zones` | list / insert | 200/201, 400, 404, 409 |
| `GET /zones/{id}` · `PATCH` · `DELETE ?cascade=&dry_run=` | see §4.4 | 200, 204, 400, 404, 409 |
| `GET /zones/{id}/aisles` · `POST` · `POST …:generate` | list / insert / expand + bulk insert (optionally with nested `rack{}`, `shelf{}`) | 200/201, 400, 404, 409 |
| `GET /aisles/{id}` · `PATCH` · `DELETE` | as above, one level down | 200, 204, 400, 404, 409 |
| `GET /aisles/{id}/racks` · `POST` · `POST …:generate` | as above | 200/201, 400, 404, 409 |
| `GET /racks/{id}` · `PATCH` · `DELETE` | as above | 200, 204, 400, 404, 409 |
| `GET /racks/{id}/shelves` · `POST` · `POST …:generate` | as above | 200/201, 400, 404, 409 |
| `GET /shelves` | the flat catalogue: `warehouse`, `zone`, `aisle`, `rack`, `level`, `code`, `max_weight_gte`, `max_volume_gte`, paginated | 200, 400 |
| `GET /shelves/{id}` · `PATCH` · `DELETE ?dry_run=` | leaf: no cascade, only the blocking check | 200, 204, 400, 404, 409 |
| `PATCH /shelves:bulk` | `{ids, patch}`; **all-or-nothing** — an unknown id ⇒ `404 { missing:[…] }`, nothing written | 200, 400, 404 |

Response shapes carry the id, the parent id, the natural key, measures as `{value, unit}`, and `created_at` / `updated_at`. Shelves additionally carry the composed `code` and, in the flat catalogue, the `warehouse_id` / `zone` / `aisle` / `rack` path.

### 4.4 Delete semantics, in one place

1. does the node exist? → `404`
2. `blocked_shelves(level, id)` — any reservation **or** any record blocks (uniform rule, §7 of the design)
   - blocked ⇒ `409` with `error` (`in_use` when anything active exists, otherwise `has_history`), `message`, `blocked_count`, `blocked_by` (≤20, each with `shelf_id`, `code`, `reason`, counts), `would_delete`
3. has children and no `?cascade=true` ⇒ `409 has_children` + child counts + a hint
4. `dry_run` ⇒ stop here and return `200 { would_delete }` (D10)
5. otherwise delete the subtree bottom-up in **one transaction** ⇒ `204`

`DELETE /warehouses/{id}` is deliberately **not implemented** (D6 of the design doc).

---

## 5. Phase 3 — `.http`

New file `wms-api/topology.http` (the existing `.http` stays as it is — it is a different domain and a single file would be unreadable). Structure:

1. variables (`@host`, `@warehouse_id`, and ids captured from earlier responses)
2. **read path** — locations, warehouses, layout at each `depth`, the flat shelf catalogue with each filter
3. **single-item writes** — zone → aisle → rack → shelf, each with its `PATCH`
4. **the declarative path** — `POST /layout` with `?dry_run=true` first, then for real (the 8×20×5 = 800-shelf example from the design doc), then `:generate` at all three levels
5. **bulk** — `GET /shelves?…` → `PATCH /shelves:bulk`
6. **deletes** — `dry_run` first, then cascade; plus deliberately failing calls: delete a shelf that holds history (`409 has_history` — there is real data for this), a zone without `cascade` (`409 has_children`), a duplicate code (`409`), a bad range (`400`), a wrong `naming` (`400`)
7. **repeated delete** → `404` (D5)

Each block gets a one-line comment saying what it demonstrates and what the expected status is — the file doubles as executable documentation until `openapi.yaml` catches up.

---

## 6. Order of work

| Step | Content | Checkpoint |
|---|---|---|
| 1 | Schema + generator fix + regenerated seed (§3), then the volume refresh on your go-ahead | Container comes up from the new seed; LARGE generation passes |
| 2 | `topology/` — `errors`, `measures`, `labels`, `pagination`, `sql` | `python -m topology.labels` self-check passes |
| 3 | Reads: `GET /locations`, `/warehouses*`, nested listings, `GET /shelves`, `GET /layout` | Reads answer correctly against real data |
| 4 | Single-item writes: `POST` / `PATCH` at every level | Unique constraint returns `409`, not a stack trace |
| 5 | `deletion.py` + all `DELETE`s + `dry_run` + `cascade` | `409 has_history` on a shelf with records; `204` on one of the 4 clean shelves |
| 6 | `POST /layout` + the three `:generate`s + `PATCH /shelves:bulk` | 800 shelves in one transaction; `dry_run` predicts the same result |
| 7 | `topology.http` + a README section | The whole file runs top to bottom |

Steps 3–6 each end in a working, demonstrable API — if time runs out, what exists still stands on its own.

---

## 7. Testing

The repo stays test-file-free (your call), so verification rests on two things:

- **`labels.py` carries a `__main__` self-check** — mismatched prefixes, reversed ranges, padding width, single-element ranges, over-limit ranges. Range expansion is the only pure logic here with genuine edge cases, and `python -m topology.labels` keeps it honest without adding a framework, a dependency or a `tests/` directory
- **`topology.http` is the integration test** — run top to bottom against the seeded DB, including the deliberately failing calls in §5.6. Every block states its expected status, so a wrong answer is visible without an assertion library

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Regenerating the seed rewrites the whole dataset (a large, noisy diff) and refreshing the DB drops the volume | Accepted (D6): the data is generated and reproducible. The `down -v` step is never run without your go-ahead, and everything else in phase 1 is a normal reviewable diff |
| The generator is the only thing standing between the seed and the four unique indexes | Phase 1 ends with a LARGE-mode generation run, which is precisely where the current `i % NUM_RACKS` bug would surface |
| 800-row inserts through `text()` | Multi-row `INSERT … VALUES (…),(…) RETURNING`, batched, all inside one transaction. D11's limits keep the payload bounded |
| `409` from the unique index arriving as a raw psycopg error | `IntegrityError` is caught and mapped to the `409` envelope, with the constraint name translated into which key collided |
| `openapi.yaml` drifting further from reality | Explicitly deferred. Phase 2 keeps request/response shapes in `schemas.py` in one place, so generating the contract later is transcription, not archaeology |

---

## 9. What this deliberately does not touch

`capacity` (D7 of the design), `DELETE /warehouses`, `PUT /layout`, occupancy reads, operational shelf availability, the frontend, authn/authz, and `openapi.yaml` — the last one by your explicit call, as a separate step once the endpoints are settled.

---

## 10. Settled on 2026-08-27

| Question | Answer |
|---|---|
| Seed data | Edit `create-wms-schema.sql` only, regenerate `wms-latest.sql` via the Taskfile. No migration file (D6) |
| Units | Hybrid — verbatim for aisle/rack, normalised to kg/m³ for shelf (D4) |
| `naming` | Accept only the canonical template, `400` otherwise (D7) |
| Tests | No test files; `labels.py` self-check + `topology.http` (§7) |

Everything else in this document stands as the default I am prepared to defend.
