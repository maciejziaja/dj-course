# WMS API

Warehouse Management System.

## Setup

1.  **Przygotowanie środowiska** (tworzy venv i instaluje zależności):
    ```bash
    ./recreate-venv.sh
    ```

2.  **Uruchomienie aplikacji** (startuje serwer deweloperski):
    ```bash
    ./run-local.sh
    ```

## Docker

```bash
docker build -t wms-api .
docker run -p 5000:5000 wms-api
```

## Warehouse topology API

CRUD over the warehouse structure `warehouse → zone → aisle → rack → shelf`.
Design: `plans/wms-topology-api.md`, implementation plan: `plans/wms-topology-implementation.md`.
Executable documentation: **`topology.http`** — run it top to bottom against a freshly
seeded database; every block states the status it expects, failing calls included.

> **Watch the plural.** `/warehouse/{id}` (singular, in `.http`) is the pre-existing
> endpoint returning the *employees* of a warehouse. `/warehouses` (plural) is the
> topology. Two namespaces, no overlap.

### Endpoints

```http
GET    /locations                     ?city= &country= &q= &page= &limit=

GET    /warehouses                    ?city= &country= &q= &page= &limit=
GET    /warehouses/{id}
POST   /warehouses                    { name, description?, location_id | location{...} }
PATCH  /warehouses/{id}
GET    /warehouses/{id}/layout        ?depth=zone|aisle|rack|shelf
POST   /warehouses/{id}/layout        ?dry_run=true

GET    /warehouses/{id}/zones         POST /warehouses/{id}/zones
GET    /zones/{id}                    PATCH /zones/{id}   DELETE /zones/{id}  ?cascade= &dry_run=
GET    /zones/{id}/aisles             POST /zones/{id}/aisles    POST /zones/{id}/aisles:generate
GET    /aisles/{id}                   PATCH /aisles/{id}  DELETE /aisles/{id} ?cascade= &dry_run=
GET    /aisles/{id}/racks             POST /aisles/{id}/racks    POST /aisles/{id}/racks:generate
GET    /racks/{id}                    PATCH /racks/{id}   DELETE /racks/{id}  ?cascade= &dry_run=
GET    /racks/{id}/shelves            POST /racks/{id}/shelves   POST /racks/{id}/shelves:generate

GET    /shelves                       ?warehouse= &zone= &aisle= &rack= &level= &code=
                                      &max_weight_gte= &max_volume_gte= &page= &limit=
GET    /shelves/{id}                  PATCH /shelves/{id}  DELETE /shelves/{id} ?dry_run=
PATCH  /shelves:bulk                  { ids: [...], patch: {...} }
```

There is no `DELETE /warehouses/{id}` and no `PUT` at any level — both deliberately
(see the design doc). The `:generate` and `:bulk` paths are why the topology blueprints
are registered **without** a `url_prefix`: Flask always joins a prefix with `/`.

### What is worth knowing before the first call

- **Addressing is by id.** The composed path `A-01-R001-L4` is never stored: it is
  built on read from `zone.code`, `aisle.label`, `rack.label` and `shelf.level`, each of
  which is unique within its parent. That is also why `-` is not allowed inside any of
  them (`^[A-Za-z0-9_]{1,16}$`, level `{1,8}`) — the dash is the separator.
- **Units.** `aisle.width` and `rack.max_height` have a unit column, so `{value, unit}`
  with `mm|cm|m` is stored **verbatim**. `shelf.max_weight` / `max_volume` have none, so
  they are **normalised** to kg / m³ on write and always read back in those units. A bare
  number means "already in the base unit" (mm / kg / m³).
- **Deleting** reads `storage_reservation` and `storage_record` — the only coupling this
  API has to the rest of the system. Any trace blocks: `409 in_use` when something is
  still open (retry later), `409 has_history` when it never will be (the shelf stays).
  A node with children needs `?cascade=true`, and the whole subtree goes in one
  transaction or not at all. `?dry_run=true` returns the status the real call would —
  a `409` with the full blocked payload when it would fail, `200 { would_delete }` when
  it would succeed. A repeated `DELETE` answers `404`: that id is stale.
- **Bulk PATCH takes ids, never a filter** — you patch exactly the shelves you just saw
  in `GET /shelves`. One unknown id and nothing at all is written.
- **Hard limits:** 50 zones per layout call, 200 aisles/zone, 200 racks/aisle,
  50 shelves/rack, 5000 shelves per request, 5000 ids per bulk patch.

### Layout of the code

```
src/topology/     errors.py (the error envelope + the Flask handlers), measures.py,
                  labels.py, pagination.py, sql.py, schemas.py (pydantic request bodies),
                  repository.py (SQL + response shapes), building.py (templates → rows),
                  deletion.py (the whole delete policy)
src/routes/       locations.py, warehouses.py, zones.py, aisles.py, racks.py, shelves.py
src/contract/     models.py — generated from openapi.yaml, never edited by hand
```

### Checks

Range expansion is the only piece of pure logic here with real edge cases, so it carries
its own self-check:

```bash
cd src && python -m topology.labels    # mismatched prefixes, reversed ranges, padding, limits
```

Everything else is covered by the contract suite below, and by `topology.http` against
the seeded database.

## The API contract

`openapi.yaml` describes all 41 operations — the topology endpoints above *and* the
older `/employees`, `/contractors`, `/payments`, `/storage` and `/warehouse/{id}` ones.
It is not documentation that sits beside the code: `src/openapi_guard.py` loads it at
start-up and enforces it on every request and every response.

### Where it lives

The contract is the source of truth, so it is split into files small enough to work on:

```
openapi/openapi.yaml            the root — info, tags, and an index of $refs
openapi/paths/*.yaml            path items, one file per resource (11 files)
openapi/components/             parameters.yaml, responses.yaml, schemas/*.yaml
```

Two things are generated from it and committed:

| artefact | from | by |
| --- | --- | --- |
| `openapi.yaml` | `openapi/` | `task contract-bundle` |
| `src/contract/models.py` | `openapi.yaml` | `task contract-models` |

`openapi.yaml` is the assembled document; **every tool reads it and nothing reads
`openapi/` except the bundler** — the guard, the tests, schemathesis, Redocly and the
model generator all load the bundle. That is also why a `$ref` inside `openapi/` points
at `#/components/schemas/X` in the *assembled* file rather than at a sibling file: the
fragments are parts of one document, not documents themselves.

`task contract-regen` runs both generators and rebuilds the docs.

### Commands

```bash
task contract            # the lot: lint, style, types, tests, docs
task contract-lint       # offline gate: artefacts current, spec valid, every route described
task contract-style      # Redocly's ruleset — is it *good* OpenAPI (needs npx)
task typecheck           # mypy over src, scripts and tests
task contract-test       # pytest, guard in strict mode
task contract-docs       # -> wms-api/docs/api.html (self-contained, no server needed)
task contract-fuzz       # property-based testing against a running API (reads only)
task contract-fuzz-all   # every operation; snapshots and restores the database
task contract-regen      # rebuild openapi.yaml, the models and the docs
```

### What stops the contract from drifting

There is no CI server and no git hook here. The gate is built out of the things that
already have to happen:

1. **The app refuses to start** against a contract that does not describe its own route
   table. `OpenAPIGuard.init_app` compares the Flask URL map with the spec: fatal in
   `strict` (which the test suite runs), logged as an error otherwise. An undocumented
   route could not be served anyway — the guard answers it `500 contract_gap` — so
   failing at start-up beats failing per request.
2. **`task contract-lint` runs before anything else does.** `run-wms`,
   `run-wms-with-local-api`, `run-only-local-api`, `contract-test`, `contract-fuzz` and
   `contract-fuzz-all` all declare it as a dependency. It regenerates both artefacts into
   memory and fails on any difference, so a committed `openapi.yaml` that no longer
   matches `openapi/` — or models that no longer match the contract — stop you before the
   API starts. It needs no server, no database and no network.
3. **The test suite asserts the same things** (`tests/test_spec.py`), including that the
   start-up gate itself fires.

### Type safety, in a language that has none at runtime

Python cannot promise at compile time that a handler returns what the contract says, and
no static type can describe `?limit=abc` arriving as a string. So the guarantee is bought
in two halves, and neither one covers the other:

* **Runtime — `src/openapi_guard.py`.** `openapi-core` validates every request against
  the contract *before* the handler runs (body, query string, headers, path parameters,
  `Content-Type`) and every response *before* it leaves the process. It is one
  `before_request`/`after_request` pair over the whole app rather than a per-view
  decorator, so a new route cannot forget to opt in.
* **Static — `mypy` (`task typecheck`), with `check_untyped_defs`.** Without that flag
  mypy skips unannotated function bodies, which is most of this codebase, and finds
  nothing. With it, it reads the pydantic models in `topology/schemas.py` and the
  generated ones in `contract/models.py` and checks the handlers against them. It found
  real defects on its first run: `body.width.value` on a field typed `Optional[Length]`,
  `int(os.environ.get('PORT'))` on a `str | None`, and a test importing a function that
  had been moved. `parse_body(ZonePatch)` is generic (`TypeVar` bound to `BaseModel`) for
  exactly this reason — a helper that returns `BaseModel` launders away the type that
  makes the check possible.

`src/contract/models.py` is where the two halves meet: generated from the contract with
`--strict-nullable`, so a required `nullable: true` field is `str | None` rather than a
lie, and `--enum-field-as-literal all`, so `unit` is a `Literal['mm', 'cm', 'm']`.
`routes/contractors.py` validates its responses through those models before returning
them.

### Validation modes

`OPENAPI_VALIDATION` picks how much the guard does:

| mode | requests | responses |
| --- | --- | --- |
| `off` | — | — |
| `request` | 400 on violation | — |
| `observe` *(default)* | 400 on violation | validated, violations logged |
| `strict` | 400 on violation | validated, violation becomes a 500 |

`observe` is what `docker-compose.yml` sets: a response that stopped matching the
contract is worth an alert, not worth breaking a client that is coping with it. The
test suite runs `strict`, so drift fails the build instead of the alerting.

### Two things the contract deliberately does not say

* **Timestamps are not `format: date-time`.** The legacy endpoints render them through
  Flask's JSON encoder as RFC 1123 (`Wed, 11 Dec 2024 06:50:57 GMT`) and the topology
  ones as naive ISO with no offset. Neither is RFC 3339, so both are pinned with an
  explicit `pattern` instead of a format that would be a lie — and would fail at
  runtime, since the guard actually checks it.
* **`payment.amount` is a string.** It is a Postgres `NUMERIC`, and Flask serialises it
  as `"1814.73"` rather than a JSON number.

Both were found by turning response validation on, not by reading the code.
