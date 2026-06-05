# Zadanie 5 — Storage Module (JSONB): plan pozostałych prac

> Dokument zbiera **całą pozostałą robotę** do domknięcia Zadania 5.
> Konwencja: opis po polsku, SQL/kod po angielsku (spójnie z resztą repo).

---

## ✅ Status — co już zrobione (Krok 1 + 2 + 4 + 6 + trwałość + aktywacja LARGE)

Moduł cargo **działa w żywej bazie** (pełny re-init na `MODE=LARGE`, zweryfikowany). Architektura zgodna z resztą repo:
- `wms-data-generator/schema/create-wms-schema.sql` — **czyste DDL** (tabele + indeksy + funkcja + trigger; **zero** INSERT-ów),
- dane wszystkich 3 tabel cargo produkuje **generator** (`src/generators/`), audyt zasila **trigger** (nie jawne INSERT-y),
- `generate-and-sync` skleja DDL + wygenerowane INSERT-y → `postgres/init-scripts/wms-latest.sql` (aktywny init-script). Regeneracja **odtwarza** moduł cargo zamiast go kasować (Priorytet 0 rozwiązany u źródła).

| Obiekt | Rola |
|---|---|
| `cargo_category` + `idx_cargo_category_name` (UNIQUE) | słownik kategorii |
| `cargo` (`name`, `weight` kolumny; `metadata JSONB NOT NULL DEFAULT '{}'`) | towar + elastyczny „paszport techniczny" |
| `idx_cargo_category` | FK index pod JOIN kategorii |
| `idx_cargo_metadata_gin` (GIN) | search po dowolnym kluczu/wartości — *potwierdzone użycie (LARGE)* |
| `idx_cargo_fragile` (partial) | „błyskawiczne" wskazanie fragile — *potwierdzone użycie (LARGE)* |
| `idx_cargo_volume` (expression + partial) | analityka liczbowa po `volume` — *potwierdzone użycie* |
| `cargo_metadata_audit` (`changed_by`→kto, `changed_at`→kiedy, `old/new_metadata`→co) + `idx_cargo_audit_cargo` | audyt |
| `cargo_metadata_audit_fn()` + trigger `trg_cargo_metadata_audit` (`AFTER INSERT OR UPDATE OF metadata`) | **automatyczne** zasilanie audytu (Krok 4) |
| dane (generator): 4 kategorie + 5000 towarów + 7000 audytu | LARGE; audyt = 5000 (insert `old=NULL`) + 2000 (update `old→new`) **w całości z triggera** |

**Pozostało:** Krok 3 (queries — dokument referencyjny poniżej), Krok 5 (Flask — opcjonalny). Reszta zrobiona i zweryfikowana na żywej bazie.

---

## ✅ Priorytet 0 — Trwałość zmian vs generator danych — ROZWIĄZANE

**Pierwotny problem:** `task generate-sql-and-sync` (`generate-and-sync.sh`) robi `rm -rf ../postgres/init-scripts/wms-*.sql` → **kasuje `wms-latest.sql`** i odtwarza go z `create-wms-schema.sql` + wygenerowanych `INSERT`-ów. Ręczne edycje w `wms-latest.sql` zostałyby wymazane.

**Rozwiązanie (Krok 6 — generator jako źródło prawdy):**
- `create-wms-schema.sql` zawiera **tylko DDL** modułu cargo (DROP-y, CREATE TABLE/INDEX, funkcja, trigger). Zero seedów.
- Dane wszystkich 3 tabel produkuje generator (patrz Krok 6). `generate-and-sync` regeneruje `wms-latest.sql` z DDL + świeżych INSERT-ów → moduł cargo jest **odtwarzany, nie kasowany**.

> Zwalidowane: cały wygenerowany plik (SMALL) puszczony na żywym Postgresie w `BEGIN … ROLLBACK` — 4/12/17 (kategorie/towary/audyt), zero błędów, baza nietknięta.

### Aktywacja schematu w działającej bazie — ✅ ZROBIONE (LARGE)

Init-scripty odpalają się tylko na pustym wolumenie, więc zrobiony pełny re-init na `MODE=LARGE`:
```sh
task generate-sql-and-sync MODE=LARGE   # regeneruje wms-latest.sql (115 MB) z generatora
task wms-down-and-clear                  # down --remove-orphans -v (kasuje wolumen)
task run-wms                             # świeży init ładuje wms-latest.sql
```

> ⚠️ **Mina przy re-init (kolejność init-scriptów):** Postgres ładuje pliki z `init-scripts/` **alfabetycznie**. `add-indexes.sql` ('a') ładował się **przed** `wms-latest.sql` ('w') i robił `CREATE INDEX ON public.shelf/...` na tabelach, których jeszcze nie ma → init by się wywalił. Dotąd nie bolało, bo `add-indexes.sql` powstał po inicjalizacji wolumenu (nigdy się nie wykonał). **Fix:** `git mv postgres/init-scripts/add-indexes.sql postgres/add-indexes.sql` (poza katalog init). Te indeksy to artefakt innego zadania (optymalizacja M8), nie są częścią schematu cargo — w razie potrzeby: `psql ... < postgres/add-indexes.sql`.

**Stan po re-init (żywa baza, `deliveroo`):** `cargo_category=4`, `cargo=5000`, `cargo_metadata_audit=7000` (5000 insert `old=NULL` + 2000 update `changed_by` set) — całość audytu z triggera. Pozostałe domeny: `storage_event_history=600000`, `payment=45000`, …

---

## Krok 3 — Zapytania SQL (rdzeń DoD)

Endpoint-y są montowane pod `/storage` (`app.register_blueprint(storage_bp, url_prefix='/storage')`).
Dla każdego: **mapowanie parametrów requestu → parametrów SQL**, samo query, oraz indeks który je obsługuje.

### 3.1 `POST /storage/cargo` — rejestracja towaru

| Request (`.http`) | Param SQL |
|---|---|
| body `name` | `:name` |
| body `category_id` | `:category_id` |
| body `weight` | `:weight` |
| body `metadata` (obiekt JSON) | `:metadata` (jako `json.dumps(...)`, `CAST` do `jsonb`) |

```sql
INSERT INTO cargo (category_id, name, weight, metadata)
VALUES (:category_id, :name, :weight, CAST(:metadata AS jsonb))
RETURNING cargo_id, category_id, name, weight, metadata, created_at;
```

- Indeks: brak potrzeby (INSERT). FK pilnuje istnienia `category_id`.
- Edge: brak `metadata` → kolumna ma `DEFAULT '{}'`, więc można pominąć w `INSERT`. Zwróć `201 Created` + obiekt z `cargo_id`.

### 3.2 `GET /storage/cargo/:id` — szczegóły + nazwa kategorii

| Request | Param SQL |
|---|---|
| ścieżka `:id` | `:cargo_id` |

```sql
SELECT c.cargo_id, c.name, c.weight, c.metadata,
       c.category_id, cat.name AS category_name,
       c.created_at, c.updated_at
FROM cargo c
JOIN cargo_category cat ON cat.category_id = c.category_id
WHERE c.cargo_id = :cargo_id;
```

- Indeks: PK `cargo_id` + `idx_cargo_category` (JOIN).
- Edge: brak wiersza → `404`. `metadata` zwracane w całości (req: „widzieć dane jako integralną część towaru").

### 3.3a `PATCH /storage/cargo/:id/metadata` — partial update (merge)

| Request | Param SQL |
|---|---|
| ścieżka `:id` | `:cargo_id` |
| całe body (obiekt JSON do scalenia) | `:patch` (`json.dumps`, `CAST` do `jsonb`) |

```sql
UPDATE cargo
SET metadata   = metadata || CAST(:patch AS jsonb),
    updated_at = CURRENT_TIMESTAMP
WHERE cargo_id = :cargo_id
RETURNING metadata;
```

- Operator `||` = **shallow merge**: dodaje nowe klucze, nadpisuje istniejące, **zachowuje resztę** (dokładnie req „nadpisywanie wybranych fragmentów bez utraty pozostałych").
- ⚠️ `||` scala tylko **top-level**. Zagnieżdżony obiekt zostaje *podmieniony w całości*, nie scalony głęboko. Dla deep-merge per ścieżka: `jsonb_set(metadata, '{specs,cpu}', :val)`.
- Edge: brak wiersza → `404`.

### 3.3b `DELETE /storage/cargo/:id/metadata/:key` — usunięcie klucza

| Request | Param SQL |
|---|---|
| ścieżka `:id` | `:cargo_id` |
| ścieżka `:key` | `:key` |

```sql
UPDATE cargo
SET metadata   = metadata - :key,
    updated_at = CURRENT_TIMESTAMP
WHERE cargo_id = :cargo_id
RETURNING metadata;
```

- Operator `-` usuwa **klucz top-level**. Dla zagnieżdżonego: `metadata #- :path` gdzie `:path` to `text[]`, np. `'{specs,cpu}'`.
- Edge: usunięcie nieistniejącego klucza = no-op (zwraca aktualne `metadata`). Brak wiersza → `404`.

### 3.4 `GET /storage/cargo/search?fragile=true` — search po metadanych

| Request | Param SQL |
|---|---|
| query `?fragile=true` | `:fragile` (bool) |

**Wariant rekomendowany** (używa partial `idx_cargo_fragile`):
```sql
SELECT cargo_id, name, weight, metadata
FROM cargo
WHERE (metadata->>'fragile')::boolean = true;
```

**Wariant ogólny** (containment, używa GIN `idx_cargo_metadata_gin`):
```sql
SELECT cargo_id, name, weight, metadata
FROM cargo
WHERE metadata @> CAST(:filter AS jsonb);   -- :filter np. '{"fragile": true}'
```

- ⚠️ **Pułapka typów przy `@>`:** `'{"fragile": true}'` (JSON bool) ≠ `'{"fragile": "true"}'` (string). Parametr z query to string, więc API musi go skoercować do właściwego typu JSON, zanim zbuduje `:filter` (dla flag → bool, dla liczb → number). Dlatego dla `fragile` prościej i pewniej wariant rekomendowany.

### 3.5 `GET /storage/cargo/stats?firmware=1.2.1` — statystyki wagi

> Uwaga: param `firmware` mapuje na klucz metadanych **`firmware_version`** (tak jest w przykładach `.http`).

| Request | Param SQL |
|---|---|
| query `?firmware=1.2.1` | `:firmware` |

```sql
SELECT COALESCE(SUM(weight), 0) AS total_weight,
       COUNT(*)                 AS count
FROM cargo
WHERE metadata @> jsonb_build_object('firmware_version', :firmware);
```

- Indeks: GIN `idx_cargo_metadata_gin`. `jsonb_build_object` bezpiecznie buduje wartość string (bez ręcznego sklejania JSON).
- Zwraca np. `{ "total_weight": 1250.50, "count": 10 }`.

**Wariant analityki liczbowej (req #4 — „łączna waga wg objętości"):**
```sql
SELECT COALESCE(SUM(weight), 0) AS total_weight,
       COUNT(*)                 AS count
FROM cargo
WHERE metadata ? 'volume'                          -- WYMAGANY predykat (patrz Appendix)
  AND (metadata->>'volume')::numeric = :volume;    -- lub BETWEEN / >
```
- Indeks: `idx_cargo_volume`. **Predykat `metadata ? 'volume'` jest obowiązkowy**, inaczej planner nie użyje partial indexu (udowodnione `EXPLAIN`-em — patrz Appendix).

### 3.6 `GET /storage/cargo/:id/history` — audit log

| Request | Param SQL |
|---|---|
| ścieżka `:id` | `:cargo_id` |

```sql
SELECT changed_at, changed_by, old_metadata, new_metadata
FROM cargo_metadata_audit
WHERE cargo_id = :cargo_id
ORDER BY changed_at DESC;
```

- Indeks: `idx_cargo_audit_cargo (cargo_id, changed_at DESC)` — pokrywa filtr + sort.
- Zwraca listę zmian (timestamp, old, new) — zgodnie z `.http`.

---

## Krok 4 — Trigger audytu (zasila `cargo_metadata_audit`) — ✅ ZROBIONE

Audit log ma być wypełniany **automatycznie**, by nie dało się go obejść z poziomu aplikacji.

> **Status:** zaimplementowany w `wms-latest.sql` **i** `create-wms-schema.sql` (mirror). Trigger umieszczony **przed** seedami cargo → 5 przykładowych towarów też trafia do audytu (5 wpisów `old=NULL`). Zwalidowany na żywym Postgresie (`ROLLBACK`): seed → 5 wpisów; realny update logowany z `changed_by` z GUC (`set_config('app.current_user_id','7',true)` → `7`); `SET metadata = metadata` (no-op) odsiany przez `IS DISTINCT FROM`. Kod poniżej = stan faktyczny.

```sql
CREATE OR REPLACE FUNCTION cargo_metadata_audit_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO cargo_metadata_audit (cargo_id, changed_by, old_metadata, new_metadata)
        VALUES (
            NEW.cargo_id,
            NULLIF(current_setting('app.current_user_id', true), '')::int,  -- KTO (NULL gdy brak)
            NULL,                                                            -- brak stanu "przed"
            NEW.metadata
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.metadata IS DISTINCT FROM NEW.metadata THEN
        INSERT INTO cargo_metadata_audit (cargo_id, changed_by, old_metadata, new_metadata)
        VALUES (
            NEW.cargo_id,
            NULLIF(current_setting('app.current_user_id', true), '')::int,
            OLD.metadata,
            NEW.metadata
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cargo_metadata_audit
AFTER INSERT OR UPDATE OF metadata ON cargo
FOR EACH ROW
EXECUTE FUNCTION cargo_metadata_audit_fn();
```

**„Kto" bez auth — wzorzec GUC (session/transaction variable):**
- Aplikacja na początku transakcji ustawia: `SELECT set_config('app.current_user_id', '<employee_id>', true)` (`true` = local do transakcji).
- Trigger czyta `current_setting('app.current_user_id', true)` (`true` = `missing_ok`, zwraca `NULL` gdy nieustawione).
- Kontrakt `.http` nie przekazuje usera → w praktyce `changed_by` będzie `NULL`. Kolumna i mechanizm są gotowe na auth w przyszłości.

**Alternatywa (audit na poziomie aplikacji):** w handlerze PATCH/DELETE, w tej samej transakcji: odczyt starego `metadata` → `UPDATE` → ręczny `INSERT` do audytu z jawnym `employee_id` z requestu.
- ✅ jawne „kto" bez GUC. ❌ omijalne, jeśli ktoś zmodyfikuje `cargo` poza aplikacją.
- **Rekomendacja:** trigger + GUC (gwarancja kompletności audytu).

**Umiejscowienie (stan faktyczny):**
- Funkcja + trigger są w DDL (`create-wms-schema.sql`), **po** `CREATE TABLE cargo`. `DROP FUNCTION IF EXISTS cargo_metadata_audit_fn() CASCADE;` jest w bloku `DROP` na górze pliku.
- INSERT-ów cargo w schemacie **już nie ma** — produkuje je generator i `create_file.py` dokleja je **po** całym DDL. Trigger istnieje, zanim te INSERT-y poleci → każdy z 5000 towarów trafia do audytu (`old=NULL`), a wygenerowane `UPDATE cargo` dają wpisy `old→new`.

---

## Krok 5 (opcjonalny) — Endpointy Flask

Dodać do `wms-api/src/routes/storage.py`. Wzorzec z istniejących handlerów: `Blueprint`, `text()` z `:param`, `result.mappings()` → `dict`, `jsonify`.

### ⚠️ Uwaga o kolizjach tras
- W `storage.py` **już istnieje** `@storage_bp.route('/cargo', methods=['GET'])` → `get_cargo_by_description()` (szuka po `storage_record.cargo_description`, *inna* domena niż nasza tabela `cargo`). Nasz `POST /cargo` współistnieje (inna metoda). Nazewnictwo się nakłada — warto to odnotować, ale konfliktu routingu nie ma.
- `GET /cargo/search`, `/cargo/stats` vs `/cargo/<int:cargo_id>`: konwerter `<int>` nie złapie `search`/`stats`, więc kolejność tras bez znaczenia.

### Pattern mutacji (commit + „kto" do triggera)
```python
from sqlalchemy import text
from database import db_engine

def _exec_mutation(query, params, actor_id=None):
    # db_engine.begin() -> auto-commit przy sukcesie, rollback przy wyjątku
    with db_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.current_user_id', :uid, true)"),
            {'uid': '' if actor_id is None else str(actor_id)},
        )
        return conn.execute(query, params).mappings().first()
```

### Szkice handlerów (do dopisania)
```python
import json
from flask import request, jsonify
from sqlalchemy import text
from database import db_engine
from application import logger

# 3.1 POST /storage/cargo
@storage_bp.route('/cargo', methods=['POST'])
def register_cargo():
    body = request.get_json(force=True)
    params = {
        'category_id': body['category_id'],
        'name':        body['name'],
        'weight':      body['weight'],
        'metadata':    json.dumps(body.get('metadata', {})),
    }
    q = text('''
        INSERT INTO cargo (category_id, name, weight, metadata)
        VALUES (:category_id, :name, :weight, CAST(:metadata AS jsonb))
        RETURNING cargo_id, category_id, name, weight, metadata, created_at;
    ''')
    with db_engine.begin() as conn:
        row = conn.execute(q, params).mappings().first()
    return jsonify(dict(row)), 201

# 3.4 GET /storage/cargo/search?fragile=true   (PRZED tras z <int>, ale i tak nie koliduje)
@storage_bp.route('/cargo/search', methods=['GET'])
def search_cargo():
    fragile = request.args.get('fragile')
    if fragile is not None:
        q = text('''SELECT cargo_id, name, weight, metadata FROM cargo
                    WHERE (metadata->>'fragile')::boolean = :fragile;''')
        params = {'fragile': fragile.lower() == 'true'}
    else:
        return jsonify([])
    with db_engine.connect() as conn:
        rows = [dict(r) for r in conn.execute(q, params).mappings()]
    return jsonify(rows)

# 3.5 GET /storage/cargo/stats?firmware=1.2.1
@storage_bp.route('/cargo/stats', methods=['GET'])
def cargo_stats():
    firmware = request.args.get('firmware')
    q = text('''
        SELECT COALESCE(SUM(weight),0) AS total_weight, COUNT(*) AS count
        FROM cargo
        WHERE metadata @> jsonb_build_object('firmware_version', :firmware);
    ''')
    with db_engine.connect() as conn:
        row = conn.execute(q, {'firmware': firmware}).mappings().first()
    return jsonify(dict(row))

# 3.2 GET /storage/cargo/<id>
@storage_bp.route('/cargo/<int:cargo_id>', methods=['GET'])
def get_cargo(cargo_id):
    q = text('''
        SELECT c.cargo_id, c.name, c.weight, c.metadata,
               c.category_id, cat.name AS category_name, c.created_at, c.updated_at
        FROM cargo c JOIN cargo_category cat ON cat.category_id = c.category_id
        WHERE c.cargo_id = :cargo_id;
    ''')
    with db_engine.connect() as conn:
        row = conn.execute(q, {'cargo_id': cargo_id}).mappings().first()
    if row is None:
        return jsonify({'error': 'not found'}), 404
    return jsonify(dict(row))

# 3.3a PATCH /storage/cargo/<id>/metadata
@storage_bp.route('/cargo/<int:cargo_id>/metadata', methods=['PATCH'])
def patch_cargo_metadata(cargo_id):
    patch = json.dumps(request.get_json(force=True))
    q = text('''
        UPDATE cargo
        SET metadata = metadata || CAST(:patch AS jsonb), updated_at = CURRENT_TIMESTAMP
        WHERE cargo_id = :cargo_id
        RETURNING metadata;
    ''')
    with db_engine.begin() as conn:
        conn.execute(text("SELECT set_config('app.current_user_id','',true)"))
        row = conn.execute(q, {'cargo_id': cargo_id, 'patch': patch}).mappings().first()
    if row is None:
        return jsonify({'error': 'not found'}), 404
    return jsonify(dict(row))

# 3.3b DELETE /storage/cargo/<id>/metadata/<key>
@storage_bp.route('/cargo/<int:cargo_id>/metadata/<key>', methods=['DELETE'])
def delete_cargo_metadata_key(cargo_id, key):
    q = text('''
        UPDATE cargo
        SET metadata = metadata - :key, updated_at = CURRENT_TIMESTAMP
        WHERE cargo_id = :cargo_id
        RETURNING metadata;
    ''')
    with db_engine.begin() as conn:
        conn.execute(text("SELECT set_config('app.current_user_id','',true)"))
        row = conn.execute(q, {'cargo_id': cargo_id, 'key': key}).mappings().first()
    if row is None:
        return jsonify({'error': 'not found'}), 404
    return jsonify(dict(row))

# 3.6 GET /storage/cargo/<id>/history
@storage_bp.route('/cargo/<int:cargo_id>/history', methods=['GET'])
def cargo_history(cargo_id):
    q = text('''
        SELECT changed_at, changed_by, old_metadata, new_metadata
        FROM cargo_metadata_audit
        WHERE cargo_id = :cargo_id
        ORDER BY changed_at DESC;
    ''')
    with db_engine.connect() as conn:
        rows = [dict(r) for r in conn.execute(q, {'cargo_id': cargo_id}).mappings()]
    return jsonify(rows)
```

- **Opcjonalnie** kontrakt pydantic (jak w `contract/`): dodać `CargoCreate` / `CargoView`. Dla zaliczenia surowy `dict` wystarcza.
- Uruchomienie API: `task run-wms` (wszystko w Dockerze) lub `task run-wms-with-local-api` + `task run-only-local-api` (API lokalnie).

---

## Krok 6 — Generator danych — ✅ ZROBIONE

Cargo jest generowane jak każda inna domena i przeżywa `generate-sql-and-sync`. Zrealizowane pliki:

1. **DDL** (`schema/create-wms-schema.sql`) — tabele/indeksy/funkcja/trigger cargo + `DROP`-y na górze. **Czyste DDL, bez INSERT-ów.**
2. **Słownik kategorii** (`src/generators/enums.py`) — `CARGO_CATEGORIES` (stała, jak `ROLES`) + `cargo_categories_insert_sql()` (z `setval`). Stałe ID 1–4 (Electronics/Chemicals/Food/Textiles), bo `.http` się na nie powołuje.
3. **Generator cargo** (`src/generators/storage/cargo.py`):
   - `generate_cargo(n)` — **hybryda**: 5 kuratorowanych próbek pierwsze (stabilne `cargo_id` 1–5, gwarantują wartości z `.http` jak `firmware_version "1.2.1"`, `fragile`, `volume`), reszta losowa z `metadata` wg kategorii.
   - `cargo_insert_sql(...)` — INSERT z jawnym `cargo_id` + `setval('cargo_cargo_id_seq', …)` (sekwencja zdrowa pod inserty z API).
   - `generate_cargo_metadata_updates(...)` / `cargo_metadata_updates_sql(...)` — zaudytowane `UPDATE cargo` (każdy patch ma unikalny `inspection_no` → zawsze zmienia metadane → trigger loguje **każdy** `old→new`, brak no-opów). `changed_by` ustawiane przez `set_config('app.current_user_id', <employee_id>, false)` przed UPDATE, reset na końcu.
4. **Audyt = trigger.** Generator **nie** emituje jawnych `INSERT INTO cargo_metadata_audit` — wypełnia go trigger z insertów cargo (`old=NULL`) i z UPDATE-ów (`old→new`). To celowo demonstruje mechanizm z Kroku 4.
5. **Ilości** (`src/config.py`) — `NUM_CARGO`, `NUM_CARGO_METADATA_UPDATES` w `DATA_QUANTITIES_SMALL` (12/5) i `…_LARGE` (5000/2000). Kategorie = stała, bez `NUM_`. → `cargo_metadata_audit = NUM_CARGO + NUM_CARGO_METADATA_UPDATES` deterministycznie.
6. **Wpięcie** (`src/generate_sql_inserts.py`) — po employees (FK `changed_by→employee`): słownik kategorii → `generate_cargo_data(result.data['employees'])`. `src/generators/storage/__init__.py` wystawia `generate_cargo_data`; `result_composite.py` ma mapowanie `cargo_categories`→`cargo_category`, `cargo`→`cargo`.

---

## Weryfikacja / DoD

DoD zadania: *„parametry z requesta HTTP da się zmapować na parametry w query SQL, uruchamiasz — działa (+ są indeksy)."*

**Checklist:**
- [x] Schemat aktywny w żywej bazie — re-init na LARGE (Priorytet 0 ✅).
- [x] Trigger audytu działa — żywa baza LARGE: 7000 wpisów (5000 `old=NULL` + 2000 `old→new` z `changed_by`), w 100% z triggera.
- [ ] Każdy z 6 requestów z `.http` zwraca oczekiwany rezultat — **zależne od Kroku 5 (Flask, opcjonalny)**.
- [x] Indeksy faktycznie używane — `EXPLAIN ANALYZE` na LARGE, **bez** `enable_seqscan=off`.

**Dowód użycia indeksów — żywa baza LARGE (planner wybiera je naturalnie):**
```sql
-- GIN: search/stats po dowolnym kluczu (containment @>)
EXPLAIN (ANALYZE, COSTS off) SELECT SUM(weight), COUNT(*) FROM cargo
  WHERE metadata @> jsonb_build_object('firmware_version','1.2.1');
--   -> Bitmap Index Scan on idx_cargo_metadata_gin  (actual rows=311)

-- Partial: błyskawiczne fragile=true
EXPLAIN (ANALYZE, COSTS off) SELECT cargo_id FROM cargo
  WHERE (metadata->>'fragile')::boolean = true;
--   -> Index Only Scan using idx_cargo_fragile  (actual rows=609)

-- Expression+partial: analityka po volume (predykat `metadata ? 'volume'` OBOWIĄZKOWY — Appendix #1)
EXPLAIN (ANALYZE, COSTS off) SELECT SUM(weight) FROM cargo
  WHERE metadata ? 'volume' AND (metadata->>'volume')::numeric > 10;
--   -> Bitmap Index Scan on idx_cargo_volume
```

**Szybki test audytu (bez API):**
```sql
SELECT set_config('app.current_user_id','7',true);
UPDATE cargo SET metadata = metadata || '{"firmware_version":"9.9.9"}'
  WHERE cargo_id = 1;
SELECT changed_by, old_metadata->>'firmware_version' AS old_fw,
       new_metadata->>'firmware_version' AS new_fw, changed_at
FROM cargo_metadata_audit WHERE cargo_id = 1 ORDER BY changed_at DESC;
```

---

## Appendix — Gotchas (pułapki)

1. **Partial index na `volume` wymaga predykatu.** Query musi zawierać `metadata ? 'volume'`, inaczej planner robi Seq Scan (nie potrafi udowodnić, że `(metadata->>'volume')::numeric > X` implikuje predykat partial). Sprawdzone `EXPLAIN`-em: bez predykatu → Seq Scan, z predykatem → `idx_cargo_volume`.
2. **`||` to shallow merge.** Zagnieżdżone obiekty są podmieniane, nie scalane głęboko. Deep-merge: `jsonb_set` per ścieżka.
3. **Usuwanie zagnieżdżonego klucza:** `metadata - 'key'` tylko top-level; głębiej `metadata #- '{a,b}'` (ścieżka jako `text[]`).
4. **Typy przy `@>`:** `{"fragile": true}` (bool) ≠ `{"fragile": "true"}` (string). Parametry z query (stringi) trzeba skoercować do właściwego typu JSON przed `jsonb_build_object`/`@>`.
5. **GIN vs `jsonb_path_ops`:** użyto domyślnego `jsonb_ops` (wspiera `@>`, `?`, `?|`, `?&`). `jsonb_path_ops` byłby mniejszy/szybszy, ale tylko dla `@>`. Świadomy wybór pod elastyczność.
6. **`setval` po seedach z jawnym `category_id`** — żeby SERIAL nie kolidował przy `INSERT`-ach z API. Towary (`cargo`) seedowane **bez** jawnego `cargo_id` (sekwencja zostaje zdrowa).
7. **`generate-sql-and-sync` KASUJE `wms-latest.sql`** (Priorytet 0) — ✅ zaadresowane: moduł cargo jest już w `create-wms-schema.sql`, więc regeneracja go **odtworzy** zamiast skasować.
8. **Init-scripty odpalają się tylko na pustym wolumenie** — istniejący kontener nie „złapie" nowego schematu bez re-initu lub ręcznego wpuszczenia DDL.
9. **Kolejność init-scriptów jest alfabetyczna.** Wiele plików w `init-scripts/` Postgres ładuje wg nazwy — `add-indexes.sql` ('a') szedł przed `wms-latest.sql` ('w') i robił `CREATE INDEX` na nieistniejących jeszcze tabelach → init failuje. Fix: trzymać tylko `wms-latest.sql` w katalogu (artefakty innych zadań wynieść poza `init-scripts/`), albo prefiksować nazwy (`01-`, `02-`).
10. **Audyt zasila trigger, nie generator.** `cargo_metadata_audit` celowo nie ma jawnych INSERT-ów w generatorze — jawne wpisy dublowałyby się z triggerem i podkopywały sens Kroku 4. Historię `old→new` budują wygenerowane `UPDATE cargo` (z unikalnym `inspection_no`, żeby `IS DISTINCT FROM` nie odsiał ich jako no-op).
