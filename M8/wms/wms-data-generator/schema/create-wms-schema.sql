DROP TABLE IF EXISTS location CASCADE;
DROP TABLE IF EXISTS warehouse CASCADE;
DROP TABLE IF EXISTS zone CASCADE;
DROP TABLE IF EXISTS aisle CASCADE;
DROP TABLE IF EXISTS rack CASCADE;
DROP TABLE IF EXISTS shelf CASCADE;
DROP TABLE IF EXISTS capacity CASCADE;
DROP TABLE IF EXISTS customer CASCADE;
DROP TABLE IF EXISTS customer_contact CASCADE;
DROP TABLE IF EXISTS customer_address CASCADE;
DROP TABLE IF EXISTS customer_employee CASCADE;
DROP TABLE IF EXISTS employee CASCADE;
DROP TABLE IF EXISTS role CASCADE;
DROP TABLE IF EXISTS employee_role CASCADE;
DROP TABLE IF EXISTS storage_request CASCADE;
DROP TABLE IF EXISTS storage_reservation CASCADE;
DROP TABLE IF EXISTS storage_record CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS storage_event_type CASCADE;
DROP TABLE IF EXISTS storage_event_history CASCADE;
DROP TABLE IF EXISTS employee_warehouse CASCADE;
DROP TABLE IF EXISTS cargo_metadata_audit CASCADE;
DROP TABLE IF EXISTS cargo CASCADE;
DROP TABLE IF EXISTS cargo_category CASCADE;
DROP FUNCTION IF EXISTS cargo_metadata_audit_fn() CASCADE;

-- LOCATIONS
CREATE TABLE location (
    location_id SERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL
);

CREATE INDEX idx_location_geo_search ON location(country, city);

-- WAREHOUSES
CREATE TABLE warehouse (
    warehouse_id SERIAL PRIMARY KEY,
    location_id INTEGER NOT NULL REFERENCES location(location_id),
    name TEXT NOT NULL,
    description TEXT
);

CREATE INDEX idx_warehouse_description ON warehouse(description);

-- ZONES
CREATE TABLE zone (
    zone_id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id),
    name TEXT NOT NULL,
    description TEXT NOT NULL
);

-- AISLES
CREATE TABLE aisle (
    aisle_id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES zone(zone_id),
    label TEXT NOT NULL,
    width INTEGER NOT NULL,
    width_unit TEXT NOT NULL
);

-- RACKS
CREATE TABLE rack (
    rack_id SERIAL PRIMARY KEY,
    aisle_id INTEGER NOT NULL REFERENCES aisle(aisle_id),
    label TEXT NOT NULL,
    max_height INTEGER NOT NULL,
    height_unit TEXT NOT NULL
);

-- SHELVES
CREATE TABLE shelf (
    shelf_id SERIAL PRIMARY KEY,
    rack_id INTEGER NOT NULL REFERENCES rack(rack_id),
    level TEXT NOT NULL,
    max_weight NUMERIC NOT NULL,
    max_volume NUMERIC NOT NULL
);

-- CAPACITY (Polymorphic association)
CREATE TABLE capacity (
    capacity_id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('WAREHOUSE','ZONE','RACK','SHELF')),
    entity_id INTEGER NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    description TEXT
);

CREATE INDEX idx_capacity_value ON capacity(value);

-- CUSTOMERS
CREATE TABLE customer (
    customer_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active','inactive')) DEFAULT 'active',
    tax_id_number TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_is_deleted ON customer(is_deleted);

-- CUSTOMER CONTACTS
CREATE TABLE customer_contact (
    contact_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    details TEXT NOT NULL
);

CREATE INDEX idx_contact_lookup ON customer_contact(details, type);
CREATE INDEX idx_customer_contact_customer_id ON customer_contact(customer_id);

-- CUSTOMER ADDRESSES
CREATE TABLE customer_address (
    address_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    street_address TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    address_type TEXT NOT NULL CHECK (address_type IN ('BILLING','SHIPPING','CORPORATE','OTHER'))
);

CREATE INDEX idx_customer_address_customer_id ON customer_address(customer_id);

-- EMPLOYEES
CREATE TABLE employee (
    employee_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    hire_date DATE NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_employee_is_deleted ON employee(is_deleted);

-- CUSTOMER EMPLOYEES (representatives/contacts working for customer companies)
CREATE TABLE customer_employee (
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employee(employee_id) ON DELETE CASCADE,
    job_title TEXT,
    employee_type TEXT, -- e.g., 'representative', 'contact_person'
    PRIMARY KEY (customer_id, employee_id)
);

-- ROLES
CREATE TABLE role (
    role_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL
);

-- EMPLOYEE ROLES
CREATE TABLE employee_role (
    employee_id INTEGER NOT NULL REFERENCES employee(employee_id),
    role_id INTEGER NOT NULL REFERENCES role(role_id),
    assigned_date DATE NOT NULL,
    PRIMARY KEY (employee_id, role_id)
);

-- EMPLOYEE-WAREHOUSE RELATION (many-to-many)
CREATE TABLE employee_warehouse (
    employee_id INTEGER NOT NULL REFERENCES employee(employee_id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id) ON DELETE CASCADE,
    assigned_from DATE NOT NULL,
    assigned_until DATE,
    PRIMARY KEY (employee_id, warehouse_id, assigned_from)
);

ALTER TABLE employee_warehouse ADD CONSTRAINT chk_assigned_dates CHECK (assigned_until IS NULL OR assigned_from < assigned_until);

-- STORAGE REQUESTS
CREATE TABLE storage_request (
    request_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouse(warehouse_id),
    requested_entry_date TIMESTAMP NOT NULL,
    requested_exit_date TIMESTAMP NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected')),
    decision_employee_id INTEGER REFERENCES employee(employee_id),
    decision_date TIMESTAMP
);

-- STORAGE RESERVATIONS
CREATE TABLE storage_reservation (
    reservation_id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES storage_request(request_id),
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
    shelf_id INTEGER NOT NULL REFERENCES shelf(shelf_id),
    reserved_weight NUMERIC NOT NULL,
    reserved_volume NUMERIC NOT NULL,
    reserved_from TIMESTAMP NOT NULL,
    reserved_until TIMESTAMP NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','active','expired','cancelled'))
);

CREATE INDEX idx_reservation_status_filter ON storage_reservation(status);

-- STORAGE RECORDS
CREATE TABLE storage_record (
    storage_record_id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES storage_request(request_id),
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
    shelf_id INTEGER NOT NULL REFERENCES shelf(shelf_id),
    actual_entry_date TIMESTAMP NOT NULL,
    actual_exit_date TIMESTAMP,
    cargo_description TEXT NOT NULL,
    cargo_weight NUMERIC NOT NULL,
    cargo_volume NUMERIC NOT NULL
);

-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CREATE INDEX idx_storage_record_cargo_description_trgm
-- ON storage_record
-- USING GIN (cargo_description gin_trgm_ops);

-- PAYMENTS
CREATE TABLE payment (
    payment_id SERIAL PRIMARY KEY,
    storage_record_id INTEGER NOT NULL REFERENCES storage_record(storage_record_id),
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled')),
    payment_date TIMESTAMP,
    external_reference TEXT
);

CREATE INDEX idx_payment_customer_id ON payment (customer_id);

-- STORAGE EVENT TYPES
CREATE TABLE storage_event_type (
    event_type_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

CREATE UNIQUE INDEX idx_storage_event_type_name ON storage_event_type(name);

-- STORAGE EVENT HISTORY
CREATE TABLE storage_event_history (
    event_id SERIAL PRIMARY KEY,
    storage_record_id INTEGER NOT NULL REFERENCES storage_record(storage_record_id),
    event_type_id INTEGER NOT NULL REFERENCES storage_event_type(event_type_id),
    event_time TIMESTAMP NOT NULL,
    employee_id INTEGER REFERENCES employee(employee_id),
    details JSONB
);

CREATE INDEX idx_storage_event_history_storage_record_id ON storage_event_history (storage_record_id);

-- =========================================================================
-- STORAGE / CARGO MODULE (JSONB) -- Task 5
-- Flexible technical "passport" of cargo in a JSONB column + change audit.
-- =========================================================================

-- CARGO CATEGORIES (dictionary of predefined product groups)
-- Req "Identification and classification": the warehouse worker picks a group before adding cargo.
CREATE TABLE cargo_category (
    category_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_cargo_category_name ON cargo_category(name);

-- CARGO (the goods; category-dependent attributes kept FLEXIBLY in "metadata")
-- Req "Identification": name + weight are first-class columns (weight = logistics/shelf load).
-- Req "Technical passport": arbitrary attributes (serial_number, adr_class, expiry_date, ...) in JSONB.
-- metadata NOT NULL DEFAULT '{}' -> partial-update (||) and key removal (-) never hit NULL.
CREATE TABLE cargo (
    cargo_id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES cargo_category(category_id),
    name TEXT NOT NULL,
    weight NUMERIC NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FK index (PostgreSQL does not index FKs automatically) -- JOIN on category in GET /cargo/:id.
CREATE INDEX idx_cargo_category ON cargo(category_id);

-- Main JSONB index: covers search by any key/value, e.g.
--   metadata @> '{"fragile": true}'                 (search by flag)
--   metadata @> '{"firmware_version": "1.2.1"}'     (stats by firmware)
--   metadata ? 'serial_number'                      (key existence)
CREATE INDEX idx_cargo_metadata_gin ON cargo USING GIN (metadata);

-- Req "Technical passport": "instantly" flag cargo that needs careful handling (fragile).
-- Partial index -- indexes ONLY fragile=true rows, so it is small and very fast.
CREATE INDEX idx_cargo_fragile ON cargo (cargo_id)
    WHERE (metadata->>'fragile')::boolean = true;

-- Req "Resource analytics": extracting NUMERIC values hidden in metadata (e.g. volume).
-- Expression B-tree on (metadata->>'volume')::numeric -> works for ranges/equality and SUM().
-- Partial (only when the key exists), because "not every cargo has a volume".
CREATE INDEX idx_cargo_volume ON cargo (((metadata->>'volume')::numeric))
    WHERE metadata ? 'volume';

-- AUDIT LOG of metadata changes
-- Req "Transparency and audit": full revision trail -- WHO / WHAT / WHEN + before/after snapshot.
--   changed_by  -> WHO  (nullable: the .http contract passes no auth/user; same pattern as storage_event_history)
--   changed_at  -> WHEN (precise time of the operation)
--   old/new_metadata -> WHAT (snapshot of "how it was" and "how it is"; old=NULL on the first entry)
CREATE TABLE cargo_metadata_audit (
    audit_id SERIAL PRIMARY KEY,
    cargo_id INTEGER NOT NULL REFERENCES cargo(cargo_id) ON DELETE CASCADE,
    changed_by INTEGER REFERENCES employee(employee_id),
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    old_metadata JSONB,
    new_metadata JSONB
);

-- History of a single cargo item, newest first (GET /cargo/:id/history).
CREATE INDEX idx_cargo_audit_cargo ON cargo_metadata_audit(cargo_id, changed_at DESC);

-- AUDIT TRIGGER: fills cargo_metadata_audit automatically so the trail cannot be
-- bypassed from the application layer. Fires on INSERT and on metadata-changing UPDATEs.
--   WHO -> app sets a transaction-local GUC (set_config('app.current_user_id', ...));
--          current_setting(..., true) returns NULL when unset (the .http contract has no auth).
--   The UPDATE branch logs only when metadata actually changed (IS DISTINCT FROM).
CREATE OR REPLACE FUNCTION cargo_metadata_audit_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO cargo_metadata_audit (cargo_id, changed_by, old_metadata, new_metadata)
        VALUES (
            NEW.cargo_id,
            NULLIF(current_setting('app.current_user_id', true), '')::int,  -- WHO (NULL when unset)
            NULL,                                                           -- no "before" state on insert
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

-- Trigger placed BEFORE the cargo seeds below, so the 5 sample rows are audited too
-- (5 INSERT entries with old_metadata = NULL) -- gives GET /cargo/:id/history immediate data.
CREATE TRIGGER trg_cargo_metadata_audit
AFTER INSERT OR UPDATE OF metadata ON cargo
FOR EACH ROW
EXECUTE FUNCTION cargo_metadata_audit_fn();

-- Cargo categories (predefined product groups; category_id 1/2 used in .http)
INSERT INTO cargo_category (category_id, name) VALUES
(1, 'Electronics'),
(2, 'Chemicals'),
(3, 'Food'),
(4, 'Textiles');
SELECT setval('cargo_category_category_id_seq', (SELECT MAX(category_id) FROM cargo_category));

-- Sample cargo (metadata shapes per .http) -- data for query testing (Step 3).
-- We leave cargo_id to SERIAL so the sequence stays healthy for inserts from the API.
INSERT INTO cargo (category_id, name, weight, metadata) VALUES
(1, 'Laptop XPS 13', 1.25, '{"serial_number": "SN-98765", "firmware_version": "1.2.0", "fragile": true, "warranty_months": 24, "volume": 2.5}'::jsonb),
(1, 'Server Rack Unit', 18.40, '{"serial_number": "SN-55501", "firmware_version": "1.2.1", "fragile": true, "volume": 60}'::jsonb),
(2, 'Industrial Cleaning Agent X', 25.00, '{"adr_class": "8", "un_number": "UN1760", "storage_temperature_max": 25, "expiry_date": "2027-12-31", "requires_ventilation": true, "volume": 30}'::jsonb),
(2, 'Solvent Z', 12.00, '{"adr_class": "3", "un_number": "UN1993", "expiry_date": "2026-09-01", "fragile": false}'::jsonb),
(3, 'Canned Goods Pallet', 320.00, '{"expiry_date": "2027-01-01", "volume": 800}'::jsonb);