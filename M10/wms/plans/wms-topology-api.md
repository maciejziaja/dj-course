# Warehouse Topology API — Design Decisions

**Date:** 2026-08-27
**Status:** design closed, ready for implementation
**Baseline:** `wms-data-generator/schema/create-wms-schema.sql`

---

## 1. Scope

CRUD over the warehouse structure: `warehouse → zone → aisle → rack → shelf`.

**In scope:** the structure and its attributes (dimensions, labels, declared shelf capacity).

**Out of scope:** occupancy, reservations, inbound and outbound movements.
`storage_reservation` and `storage_record` are read **only** by `DELETE`, to determine
whether a shelf may be removed. That is the single coupling to the rest of the system,
and it does not grow beyond that.

Consequence: `shelf.max_weight` / `shelf.max_volume` are static attributes
("declared capacity"), filterable in listings. The API does not know how much free
space remains.

---

## 2. Two observations that shaped the whole API

**Only `shelf` is referenced from the outside.** The only pointers from outside the
topology are `storage_reservation.shelf_id` and `storage_record.shelf_id`. Zone / aisle
/ rack are purely organisational wrappers that nothing points at. Therefore "being in
use" exists only at the leaf, and the question "may I delete this aisle?" reduces to a
single query over the shelves beneath it.

**Warehouse structure is regular.** Warehouses are planned as regular grids — they are
easier to assemble and safer that way. Given that, a user does not want to create 800
shelves one at a time. They want to declare a grid. Hence declarative writes
(`/layout`, `:generate`) and flat reads (`GET /shelves` with filters) instead of four
levels of nested GETs.

---

## 3. Cross-cutting decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Template-first, no `PUT /layout` in v1** | `POST /layout` + `:generate` + `PATCH` + `DELETE` express every change. `PUT` adds no new power, only convenience — and it alone would need a reconcile engine |
| D2 | **Flat addressing by id** (`/shelves/{id}`) | Short, stable URLs. Hierarchy appears only in creation and listing paths |
| D3 | **Hard delete only; blocked means 409** | History is already preserved by `storage_record`, which owns the FK. There is nothing to protect from loss, so there is no reason to introduce soft delete |
| D4 | **Bulk PATCH by an explicit `ids` list** | One filter grammar across the whole API (`GET /shelves` only); an accidental "update all" becomes impossible |
| D5 | **Cascade only via `?cascade=true`** | Safe by default, explicit intent, one parameter |
| D6 | **No `DELETE /warehouses`** | Deferred — a warehouse touches `storage_request` and `employee_warehouse`; that is a separate conversation |
| D7 | **`capacity` left untouched** | The API neither reads nor writes it. We will return to it separately |

---

## 4. Endpoints

### Warehouse

```http
GET    /warehouses                 ?city= &country= &q= &page= &limit=
GET    /warehouses/{id}
POST   /warehouses                 { location_id | location{...}, name, description? }
PATCH  /warehouses/{id}
GET    /warehouses/{id}/layout     ?depth=zone|aisle|rack|shelf
POST   /warehouses/{id}/layout     ?dry_run=true
```

No `DELETE` (D6).

### Zones — created one at a time

```http
GET    /warehouses/{id}/zones
GET    /zones/{id}
POST   /warehouses/{id}/zones      { code, name, description? }
PATCH  /zones/{id}
DELETE /zones/{id}                 ?cascade=true &dry_run=true
```

Zones have no `:generate` — "Dry storage" and "Cold room" are named entities, not
numbered ones. Regularity begins at the aisle level.

### Aisles, racks, shelves — singly or in bulk

```http
GET    /zones/{id}/aisles          GET /aisles/{id}
POST   /zones/{id}/aisles          POST /zones/{id}/aisles:generate
PATCH  /aisles/{id}                DELETE /aisles/{id}   ?cascade=true &dry_run=true

GET    /aisles/{id}/racks          GET /racks/{id}
POST   /aisles/{id}/racks          POST /aisles/{id}/racks:generate
PATCH  /racks/{id}                 DELETE /racks/{id}    ?cascade=true &dry_run=true

GET    /racks/{id}/shelves         GET /shelves/{id}
POST   /racks/{id}/shelves         POST /racks/{id}/shelves:generate
PATCH  /shelves/{id}               DELETE /shelves/{id}  ?dry_run=true
PATCH  /shelves:bulk               { ids: [...], patch: {...} }
```

### Flat shelf catalogue

```http
GET /shelves ?warehouse= &zone= &aisle= &rack= &level= &code=
             &max_weight_gte= &max_volume_gte= &page= &limit=
```

This replaces the full set of nested GETs. Nested listings (`GET /zones/{id}/aisles`)
remain as sugar — no logic of their own, just an alias for a filter.

**No `PUT` at any level.** "Replace the entire rack object" has no sensible semantics
when the object has children. Everything is either `PATCH` or regeneration.

---

## 5. Layout generator

`POST /warehouses/{id}/layout` — one call builds an entire zone.

```json
{
  "naming": "{zone}-{aisle}-{rack}-L{level}",
  "zones": [{
    "code": "A",
    "name": "Dry storage",
    "aisles":  { "count": 8, "labels": "01..08",
                 "width": { "value": 3200, "unit": "mm" } },
    "racks":   { "per_aisle": 20, "labels": "R01..R20",
                 "max_height": { "value": 6000, "unit": "mm" } },
    "shelves": { "per_rack": 5, "levels": "1..5",
                 "max_weight": { "value": 800, "unit": "kg" },
                 "max_volume": { "value": 2.4, "unit": "m3" } }
  }]
}
```

The above is 8 × 20 × 5 = **800 shelves in a single request**.

- This is a nested bulk INSERT, **not a reconcile**. Code collisions are caught by the
  unique constraint → 409 listing the conflicts
- `?dry_run=true` returns a summary ("would create 8 aisles, 160 racks, 800 shelves")
  without writing
- Everything runs in one transaction

### `:generate` — growing the structure

```http
POST /zones/{id}/aisles:generate    { labels: "09..12", rack: {...}, shelf: {...} }
POST /aisles/{id}/racks:generate    { labels: "R21..R25", shelf: {...} }
POST /racks/{id}/shelves:generate   { levels: "6..7", max_weight: {...}, max_volume: {...} }
```

Label ranges are always **explicit** — there is no automatic continuation of numbering.
Implicit numbering is a source of silent mistakes, and the unique constraint stands
guard anyway.

---

## 6. Bulk PATCH

```http
GET   /shelves?warehouse=1&zone=A&aisle=03      → [{ "id": 412, ... }, ...]
PATCH /shelves:bulk  { "ids": [412, 413, ...], "patch": { "max_weight": 1200 } }
```

Two calls instead of one, and in exchange:

- one filter grammar across the whole API (only in `GET /shelves`)
- an accidental "update all" via a forgotten filter key is impossible
- you patch exactly what you saw — not whatever was added in the meantime

800 identifiers is roughly 5 KB of payload, so size is not a concern.

---

## 7. Deletion

### The rule

```sql
-- BLOCKED (uniform — any trace blocks)
EXISTS (SELECT 1 FROM storage_reservation WHERE shelf_id = s.shelf_id)
   OR EXISTS (SELECT 1 FROM storage_record WHERE shelf_id = s.shelf_id)

-- CLASSIFICATION (for the error message only)
in_use       ⟸ reservation.status IN ('PENDING','ACTIVE')
                OR record.actual_exit_date IS NULL
has_history  ⟸ otherwise
```

For a parent node the rule is identical, just joined downward to the shelves:

```sql
SELECT s.shelf_id
FROM shelf s JOIN rack r ON r.rack_id = s.rack_id
WHERE r.aisle_id = :id
  AND (EXISTS (SELECT 1 FROM storage_reservation WHERE shelf_id = s.shelf_id)
    OR EXISTS (SELECT 1 FROM storage_record      WHERE shelf_id = s.shelf_id));
```

That is the **entire** deletion logic in this API.

### Responses

| code | HTTP | what it means to the user |
|---|---|---|
| — | `204` | physically deleted |
| `in_use` | `409` | **transient** — empty the shelf / wait for the reservation to lapse |
| `has_history` | `409` | **permanent** — the shelf stays, because it holds storage history |

The distinction exists precisely to tell the user whether retrying is worth it.

```json
{
  "error": "has_history",
  "message": "Cannot delete aisle A-03: 4 of 100 shelves hold storage history.",
  "blocked_count": 4,
  "blocked_by": [
    { "shelf_id": 412, "code": "A-03-R02-L4", "reason": "has_history", "records": 7 },
    { "shelf_id": 455, "code": "A-03-R05-L1", "reason": "in_use", "reservations": 1 }
  ],
  "would_delete": { "racks": 20, "shelves": 100 }
}
```

- `blocked_by` is truncated to 20 entries; `blocked_count` tells the truth about the whole
- when the subtree contains both kinds, the top-level `error` is `in_use` (that is the
  one the user can act on); the per-entry `reason` carries the detail

### Cascade

- without the flag: `409` with the child count and a hint
- `?cascade=true`: deletes the entire subtree, **provided nothing below is blocked**
- **all or nothing**, in one transaction — a partial delete would leave an aisle with a
  handful of orphaned shelves, a structure nobody asked for
- `?dry_run=true` returns just `would_delete` without writing — it costs nothing,
  since it is the very same pre-check query

The cascade is performed by **the application in one transaction**, not by
`ON DELETE CASCADE` in the database. A native cascade would hit the `storage_record` FK
anyway and return a raw Postgres error instead of the JSON above.

### Why no soft delete

Soft delete exists to preserve history. Here the history is **already preserved** — by
`storage_record`, which owns the FK. If a shelf has records, we simply do not delete it
and it stays an ordinary, live row.

Moreover, for a shelf with a closed record, hard delete is not even a policy choice but
arithmetic — it is **impossible**:

```sql
payment.storage_record_id             ... ON DELETE CASCADE
cargo_event_history.storage_record_id ... ON DELETE CASCADE
```

Deleting a `storage_record` would cascade away payments and the entire cargo event
history, and `shelf_id` is `NOT NULL`, so it cannot be nulled out either.

The cost of this decision: 0 new columns, 0 `WHERE deleted_at IS NULL` filters in reads,
0 ghost rows in listings, 1 pre-check query before deletion. The database's referential
integrity **is** the business rule.

The door stays open: should a real need to retire shelves despite their history ever
appear, `decommissioned_at` can be added in a single migration without breaking
anything. At that point remember the partial index `WHERE decommissioned_at IS NULL` on
the code uniqueness — otherwise a replacement shelf cannot reuse the retired one's code.

### Note on `storage_reservation`

Nothing hangs off `storage_reservation` (`request_id` cascades *into* it, not *out of*
it), so dead reservations could technically be deleted along with the shelf. We
deliberately **do not** do that — a uniform rule is one thing to explain and remember,
and `DELETE` on the topology never touches rows from another domain.

### Note on the `status` predicate

The schema has nothing that keeps `storage_reservation.status` consistent with
`reserved_from` / `reserved_until`. A reservation with `reserved_until` in the past and
a status still reading `ACTIVE` is a normal situation whenever the job that flips it to
`EXPIRED` has not run.

We read the data literally (`status` alone) — a stale status is a bug in the process
that sets it, and that is where it should be fixed. **Under the uniform blocking rule
this carries no risk:** the predicate does not decide *whether* we delete, only *which
message* we return. A stale status yields, at worst, a less accurate error text.

---

## 8. Schema changes

### Required

```sql
ALTER TABLE zone ADD COLUMN code TEXT NOT NULL;
CREATE UNIQUE INDEX uq_zone_code   ON zone(warehouse_id, code);
CREATE UNIQUE INDEX uq_aisle_label ON aisle(zone_id, label);
CREATE UNIQUE INDEX uq_rack_label  ON rack(aisle_id, label);
CREATE UNIQUE INDEX uq_shelf_level ON shelf(rack_id, level);
```

Today `zone.name`, `aisle.label`, `rack.label` and `shelf.level` carry no constraints
at all — you cannot say "shelf A-03-R02-L4", because nothing guarantees there is only
one of them.

These indexes also give something for free: since every level is unique within its
parent, **the concatenated path `A-03-R02-L4` is automatically unique within the
warehouse**. It need not be stored anywhere or guarded by a separate constraint —
composing it in the API response is enough.

### Worth doing

1. `description NOT NULL` → nullable on `warehouse` and `zone` — today it forces people
   to type `"-"`
2. `CHECK` on `aisle.width_unit` and `rack.height_unit` — free-text will sooner or later
   produce `"m"` alongside `"metres"`
3. `created_at` / `updated_at` on the topology levels

### Unchanged

`capacity` — per D7. This API neither reads nor writes it, so for now it is invisible.

> **Debt to settle when `capacity` comes back:** the table is polymorphic
> (`entity_type` + `entity_id`) and has **no FK**, so a cascading `DELETE` will leave
> rows pointing at non-existent ids and nothing will catch it. That is the first thing
> to resolve. It also duplicates `shelf.max_weight` / `shelf.max_volume`, and the
> capacity of a zone or a warehouse is by nature a derived quantity, not an entered one.

---

## 9. Deliberately deferred

| Topic | Why deferred | When it returns |
|---|---|---|
| `PUT /warehouses/{id}/layout` | Needs a reconcile engine; the only dangerous class is "present in the DB, absent from the body". When it returns — in the variant that never deletes, only returns `orphans[]` | When someone wants to keep the layout as a file in git |
| `DELETE /warehouses/{id}` | `storage_request.warehouse_id` blocks (RESTRICT), while `employee_warehouse` has `ON DELETE CASCADE` and would **silently** unassign staff | Separate conversation |
| Operational availability of a shelf (cracked, under repair) | An axis orthogonal to "exists in the structure" — merging them into one enum yields states nobody can interpret. Done properly it is a separate table with time windows | When a real need shows up |
| Occupancy reads (`free_weight_gte`, `/capacity?group_by=`) | Pulls `storage_reservation` and `storage_record` into reads | Together with `capacity` |

---

## 10. Open — to settle before implementation

- **Stack** — NestJS / Spring / FastAPI / something else
- **Pagination** — offset or cursor
- **`location`** — its own CRUD, or is inline creation in `POST /warehouses` plus
  `GET /locations` for picking enough
- **Units** — a `CHECK` on the existing columns, or normalisation to one base unit
  (mm / kg / m³) with conversion at the API boundary
- **`DELETE` idempotency** — `404` or `204` on a repeated call
