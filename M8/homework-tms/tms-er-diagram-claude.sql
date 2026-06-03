-- =====================================================================
-- TMS Fleet Module - PostgreSQL Schema
-- Synchronized with the Mermaid ER diagram (tms_fleet_schema_er.md)
-- Target: PostgreSQL 14+
--
-- Design notes:
--   * Supertype/subtype: assets + vehicles / trailers
--   * Party archetype:   parties + workshop_details / inspection_station_details
--                        (subsumes former insurers / workshops / inspection_stations)
--   * Type-discriminated FKs use composite (id, party_type) + CHECK
--   * JSONB extension points: documents.metadata, inspections.findings,
--                             alert_rules.parameters
-- =====================================================================

BEGIN;

-- =====================================================================
-- 0. CLEAN SLATE (idempotent re-run)
-- =====================================================================

DROP TABLE IF EXISTS alert_tasks                CASCADE;
DROP TABLE IF EXISTS alert_rule_recipients      CASCADE;
DROP TABLE IF EXISTS alert_rules                CASCADE;
DROP TABLE IF EXISTS tire_assignments           CASCADE;
DROP TABLE IF EXISTS tires                      CASCADE;
DROP TABLE IF EXISTS repair_parts               CASCADE;
DROP TABLE IF EXISTS inventory                  CASCADE;
DROP TABLE IF EXISTS warehouse_locations        CASCADE;
DROP TABLE IF EXISTS part_substitutes           CASCADE;
DROP TABLE IF EXISTS parts_catalog              CASCADE;
DROP TABLE IF EXISTS part_categories            CASCADE;
DROP TABLE IF EXISTS repair_orders              CASCADE;
DROP TABLE IF EXISTS damage_claims              CASCADE;
DROP TABLE IF EXISTS service_intervals          CASCADE;
DROP TABLE IF EXISTS service_types              CASCADE;
DROP TABLE IF EXISTS inspections                CASCADE;
DROP TABLE IF EXISTS inspection_types           CASCADE;
DROP TABLE IF EXISTS policy_installments        CASCADE;
DROP TABLE IF EXISTS policy_coverages           CASCADE;
DROP TABLE IF EXISTS policies                   CASCADE;
DROP TABLE IF EXISTS insurance_types            CASCADE;
DROP TABLE IF EXISTS documents                  CASCADE;
DROP TABLE IF EXISTS document_types             CASCADE;
DROP TABLE IF EXISTS workshop_details           CASCADE;
DROP TABLE IF EXISTS inspection_station_details CASCADE;
DROP TABLE IF EXISTS parties                    CASCADE;
-- Legacy pre-Party-archetype tables (removed in this version):
DROP TABLE IF EXISTS insurers                   CASCADE;
DROP TABLE IF EXISTS workshops                  CASCADE;
DROP TABLE IF EXISTS inspection_stations        CASCADE;
DROP TABLE IF EXISTS trailers                   CASCADE;
DROP TABLE IF EXISTS vehicles                   CASCADE;
DROP TABLE IF EXISTS assets                     CASCADE;
DROP TABLE IF EXISTS vehicle_models             CASCADE;
DROP TABLE IF EXISTS vehicle_makes              CASCADE;
DROP TABLE IF EXISTS body_types                 CASCADE;
DROP TABLE IF EXISTS emission_standards         CASCADE;
DROP TABLE IF EXISTS fuel_types                 CASCADE;
DROP TABLE IF EXISTS users                      CASCADE;
DROP TABLE IF EXISTS roles                      CASCADE;
DROP TABLE IF EXISTS bases                      CASCADE;

DROP TYPE  IF EXISTS task_status                CASCADE;
DROP TYPE  IF EXISTS alert_threshold_unit       CASCADE;
DROP TYPE  IF EXISTS alert_trigger              CASCADE;
DROP TYPE  IF EXISTS axle_position              CASCADE;
DROP TYPE  IF EXISTS tire_season                CASCADE;
DROP TYPE  IF EXISTS inspection_result          CASCADE;
DROP TYPE  IF EXISTS repair_class               CASCADE;
DROP TYPE  IF EXISTS interval_basis             CASCADE;
DROP TYPE  IF EXISTS party_type                 CASCADE;
DROP TYPE  IF EXISTS asset_kind                 CASCADE;

-- =====================================================================
-- 1. CUSTOM ENUM TYPES
-- =====================================================================

CREATE TYPE asset_kind          AS ENUM ('VEHICLE', 'TRAILER');
CREATE TYPE party_type          AS ENUM (
    'INSURER', 'WORKSHOP', 'INSPECTION_STATION', 'AUTHORITY', 'OTHER'
);
CREATE TYPE interval_basis      AS ENUM ('MILEAGE_KM', 'ENGINE_HOURS_MTH', 'TIME_MONTHS');
CREATE TYPE repair_class        AS ENUM ('WARRANTY', 'POST_WARRANTY', 'POST_ACCIDENT');
CREATE TYPE inspection_result   AS ENUM ('PASSED', 'CONDITIONAL', 'FAILED');
CREATE TYPE tire_season         AS ENUM ('SUMMER', 'WINTER', 'ALL_SEASON');
CREATE TYPE axle_position       AS ENUM (
    'FRONT_LEFT', 'FRONT_RIGHT',
    'DRIVE_LEFT', 'DRIVE_RIGHT',
    'TRAILER_AXLE_1_L', 'TRAILER_AXLE_1_R',
    'TRAILER_AXLE_2_L', 'TRAILER_AXLE_2_R',
    'TRAILER_AXLE_3_L', 'TRAILER_AXLE_3_R',
    'SPARE', 'STORAGE'
);
CREATE TYPE alert_trigger       AS ENUM (
    'POLICY_EXPIRY', 'INSPECTION_DUE', 'SERVICE_INTERVAL',
    'STOCK_LOW', 'DOCUMENT_EXPIRY'
);
CREATE TYPE alert_threshold_unit AS ENUM ('DAYS', 'KM', 'MTH', 'QUANTITY');
CREATE TYPE task_status         AS ENUM ('PENDING', 'IN_PROGRESS', 'ARCHIVED');

-- =====================================================================
-- 2. ORGANIZATIONAL / OPERATIONAL CONTEXT
-- =====================================================================

CREATE TABLE bases (
                       id              SERIAL PRIMARY KEY,
                       code            VARCHAR(20) UNIQUE NOT NULL,
                       name            VARCHAR(100) NOT NULL,
                       address_line    VARCHAR(255),
                       city            VARCHAR(100),
                       country_iso     CHAR(2) NOT NULL DEFAULT 'PL'
);

CREATE TABLE roles (
                       id              SERIAL PRIMARY KEY,
                       code            VARCHAR(30) UNIQUE NOT NULL,
                       name            VARCHAR(100) NOT NULL,
                       description     TEXT
);

CREATE TABLE users (
                       id              SERIAL PRIMARY KEY,
                       email           VARCHAR(150) UNIQUE NOT NULL,
                       full_name       VARCHAR(150) NOT NULL,
                       role_id         INT NOT NULL REFERENCES roles(id),
                       base_id         INT REFERENCES bases(id),
                       is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                       created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 3. PARTY ARCHETYPE
-- Supertype for external counterparties: insurers, workshops, inspection
-- stations, authorities, etc. Specializations live in *_details tables.
-- =====================================================================

CREATE TABLE parties (
                         id              SERIAL PRIMARY KEY,
                         party_type      party_type NOT NULL,
                         legal_name      VARCHAR(200) NOT NULL,
                         tax_id          VARCHAR(20) UNIQUE,
                         country_iso     CHAR(2) NOT NULL DEFAULT 'PL',
                         address_line    VARCHAR(255),
                         city            VARCHAR(100),
                         postal_code     VARCHAR(20),
                         contact_email   VARCHAR(150),
                         contact_phone   VARCHAR(30),
                         notes           TEXT,
                         created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Composite unique key allows other tables to reference (id, party_type)
    -- and lock the FK to a specific role with a CHECK constraint.
                         UNIQUE (id, party_type)
);

CREATE TABLE workshop_details (
                                  party_id        INT PRIMARY KEY,
                                  party_type      party_type NOT NULL DEFAULT 'WORKSHOP'
                                      CHECK (party_type = 'WORKSHOP'),
                                  is_internal     BOOLEAN NOT NULL DEFAULT FALSE,
                                  FOREIGN KEY (party_id, party_type)
                                      REFERENCES parties (id, party_type) ON DELETE CASCADE
);

CREATE TABLE inspection_station_details (
                                            party_id        INT PRIMARY KEY,
                                            party_type      party_type NOT NULL DEFAULT 'INSPECTION_STATION'
                                                CHECK (party_type = 'INSPECTION_STATION'),
                                            station_code    VARCHAR(30),
                                            accreditation   VARCHAR(100),
                                            FOREIGN KEY (party_id, party_type)
                                                REFERENCES parties (id, party_type) ON DELETE CASCADE
);

-- =====================================================================
-- 4. ASSET CATALOG (supertype + subtypes)
-- =====================================================================

CREATE TABLE fuel_types (
                            id              SERIAL PRIMARY KEY,
                            code            VARCHAR(20) UNIQUE NOT NULL,
                            name            VARCHAR(50) NOT NULL
);

CREATE TABLE emission_standards (
                                    id              SERIAL PRIMARY KEY,
                                    code            VARCHAR(20) UNIQUE NOT NULL,
                                    name            VARCHAR(50) NOT NULL,
                                    valid_from      DATE
);

CREATE TABLE body_types (
                            id              SERIAL PRIMARY KEY,
                            code            VARCHAR(20) UNIQUE NOT NULL,
                            name            VARCHAR(50) NOT NULL,
                            description     TEXT
);

CREATE TABLE vehicle_makes (
                               id              SERIAL PRIMARY KEY,
                               name            VARCHAR(50) UNIQUE NOT NULL,
                               country_iso     CHAR(2)
);

CREATE TABLE vehicle_models (
                                id              SERIAL PRIMARY KEY,
                                make_id         INT NOT NULL REFERENCES vehicle_makes(id),
                                name            VARCHAR(100) NOT NULL,
                                asset_kind      asset_kind NOT NULL,
                                UNIQUE (make_id, name)
);

CREATE TABLE assets (
                        id                      SERIAL PRIMARY KEY,
                        asset_kind              asset_kind NOT NULL,
                        vin                     VARCHAR(17) UNIQUE,
                        registration_number     VARCHAR(20) UNIQUE NOT NULL,
                        fleet_number            VARCHAR(20) UNIQUE NOT NULL,
                        model_id                INT REFERENCES vehicle_models(id),
                        year_of_manufacture     SMALLINT,
                        curb_weight_kg          NUMERIC(10,2),
                        gvw_kg                  NUMERIC(10,2),
                        max_payload_kg          NUMERIC(10,2),
                        current_base_id         INT REFERENCES bases(id),
                        in_service_since        DATE,
                        decommissioned_at       DATE,
                        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        CHECK (decommissioned_at IS NULL OR decommissioned_at >= in_service_since)
);

CREATE TABLE vehicles (
                          asset_id                    INT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
                          engine_power_kw             NUMERIC(8,2),
                          engine_displacement_cm3     INT,
                          fuel_type_id                INT REFERENCES fuel_types(id),
                          emission_standard_id        INT REFERENCES emission_standards(id),
                          current_odometer_km         INT NOT NULL DEFAULT 0,
                          current_engine_hours_mth    INT NOT NULL DEFAULT 0,
                          avg_fuel_consumption_l_100km NUMERIC(5,2),
                          last_known_latitude         NUMERIC(9,6),
                          last_known_longitude        NUMERIC(9,6),
                          last_position_at            TIMESTAMPTZ
);

CREATE TABLE trailers (
                          asset_id                INT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
                          body_type_id            INT REFERENCES body_types(id),
                          euro_pallets_count      SMALLINT,
                          cargo_volume_m3         NUMERIC(8,2),
                          interior_height_cm      SMALLINT,
                          has_tail_lift           BOOLEAN NOT NULL DEFAULT FALSE,
                          has_refrigeration_unit  BOOLEAN NOT NULL DEFAULT FALSE,
                          has_temperature_sensors BOOLEAN NOT NULL DEFAULT FALSE,
                          min_temperature_c       NUMERIC(4,1),
                          max_temperature_c       NUMERIC(4,1)
);

-- =====================================================================
-- 5. DIGITAL DOCUMENT REPOSITORY (JSONB metadata)
-- =====================================================================

CREATE TABLE document_types (
                                id              SERIAL PRIMARY KEY,
                                code            VARCHAR(30) UNIQUE NOT NULL,
                                name            VARCHAR(100) NOT NULL,
                                is_certificate  BOOLEAN NOT NULL DEFAULT FALSE,
                                has_expiry      BOOLEAN NOT NULL DEFAULT TRUE
);

-- `metadata` holds type-specific structured fields without forcing a wide
-- sparse table or 30+ side-tables. Example payloads:
--   ATP cert:       {"atp_class": "FRC", "equipment_serial": "...",
--                    "validity_classes": ["FRC","FNA"]}
--   Waste permit:   {"bdo_number": "000123456",
--                    "waste_codes": ["15 01 02", "16 01 03"]}
CREATE TABLE documents (
                           id                  SERIAL PRIMARY KEY,
                           asset_id            INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                           document_type_id    INT NOT NULL REFERENCES document_types(id),
                           document_number     VARCHAR(100),
                           issued_at           DATE,
                           valid_until         DATE,
                           issuing_authority   VARCHAR(200),
                           file_path           VARCHAR(500),
                           file_checksum_sha256 CHAR(64),
                           metadata            JSONB,
                           notes               TEXT,
                           created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 6. INSURANCE POLICIES
-- =====================================================================

CREATE TABLE insurance_types (
                                 id              SERIAL PRIMARY KEY,
                                 code            VARCHAR(10) UNIQUE NOT NULL,
                                 name            VARCHAR(100) NOT NULL,
                                 description     TEXT
);

CREATE TABLE policies (
                          id              SERIAL PRIMARY KEY,
                          asset_id        INT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
                          insurer_id      INT NOT NULL,
                          insurer_type    party_type NOT NULL DEFAULT 'INSURER'
                              CHECK (insurer_type = 'INSURER'),
                          policy_number   VARCHAR(50) UNIQUE NOT NULL,
                          starts_on       DATE NOT NULL,
                          ends_on         DATE NOT NULL,
                          sum_insured     NUMERIC(14,2),
                          total_premium   NUMERIC(14,2) NOT NULL,
                          currency_iso    CHAR(3) NOT NULL DEFAULT 'PLN',
                          notes           TEXT,
                          CHECK (ends_on > starts_on),
                          FOREIGN KEY (insurer_id, insurer_type)
                              REFERENCES parties (id, party_type)
);

CREATE TABLE policy_coverages (
                                  policy_id           INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
                                  insurance_type_id   INT NOT NULL REFERENCES insurance_types(id),
                                  coverage_amount     NUMERIC(14,2),
                                  PRIMARY KEY (policy_id, insurance_type_id)
);

CREATE TABLE policy_installments (
                                     id              SERIAL PRIMARY KEY,
                                     policy_id       INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
                                     installment_no  SMALLINT NOT NULL,
                                     amount          NUMERIC(14,2) NOT NULL,
                                     due_date        DATE NOT NULL,
                                     paid_at         DATE,
                                     UNIQUE (policy_id, installment_no)
);

-- =====================================================================
-- 7. LEGALIZATIONS & PERIODIC INSPECTIONS (JSONB findings)
-- =====================================================================

CREATE TABLE inspection_types (
                                  id                      SERIAL PRIMARY KEY,
                                  code                    VARCHAR(30) UNIQUE NOT NULL,
                                  name                    VARCHAR(100) NOT NULL,
                                  default_interval_months SMALLINT,
                                  legal_basis             VARCHAR(200)
);

-- `findings` holds inspection-type-specific structured data:
--   Tachograph: {"k_factor": 8000, "w_factor": 8050, "l_value_mm": 3140}
--   UDT lift:   {"max_load_kg": 1500, "load_test_passed": true, ...}
--   SKP:        {"defect_codes": ["A1.1.2"], "remarks": "..."}
CREATE TABLE inspections (
                             id                  SERIAL PRIMARY KEY,
                             asset_id            INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                             inspection_type_id  INT NOT NULL REFERENCES inspection_types(id),
                             station_id          INT,
                             station_type        party_type NOT NULL DEFAULT 'INSPECTION_STATION'
                                 CHECK (station_type = 'INSPECTION_STATION'),
                             performed_on        DATE NOT NULL,
                             next_due_on         DATE,
                             result              inspection_result NOT NULL DEFAULT 'PASSED',
                             certificate_number  VARCHAR(100),
                             cost                NUMERIC(12,2),
                             findings            JSONB,
                             notes               TEXT,
                             FOREIGN KEY (station_id, station_type)
                                 REFERENCES parties (id, party_type)
);

-- =====================================================================
-- 8. MAINTENANCE SCHEDULE
-- =====================================================================

CREATE TABLE service_types (
                               id              SERIAL PRIMARY KEY,
                               code            VARCHAR(30) UNIQUE NOT NULL,
                               name            VARCHAR(100) NOT NULL,
                               description     TEXT
);

CREATE TABLE service_intervals (
                                   id                          SERIAL PRIMARY KEY,
                                   asset_id                    INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                                   service_type_id             INT NOT NULL REFERENCES service_types(id),
                                   basis                       interval_basis NOT NULL,
                                   interval_value              INT NOT NULL,
                                   last_performed_on           DATE,
                                   last_performed_odometer_km  INT,
                                   last_performed_hours_mth    INT,
                                   next_due_on                 DATE,
                                   next_due_odometer_km        INT,
                                   next_due_hours_mth          INT,
                                   UNIQUE (asset_id, service_type_id)
);

-- =====================================================================
-- 9. WORKSHOP / REPAIR HISTORY
-- =====================================================================

CREATE TABLE damage_claims (
                               id              SERIAL PRIMARY KEY,
                               claim_number    VARCHAR(50) UNIQUE NOT NULL,
                               policy_id       INT REFERENCES policies(id),
                               incident_date   DATE NOT NULL,
                               description     TEXT,
                               estimated_loss  NUMERIC(14,2)
);

CREATE TABLE repair_orders (
                               id                  SERIAL PRIMARY KEY,
                               order_number        VARCHAR(30) UNIQUE NOT NULL,
                               asset_id            INT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
                               workshop_id         INT,
                               workshop_type       party_type NOT NULL DEFAULT 'WORKSHOP'
                                   CHECK (workshop_type = 'WORKSHOP'),
                               classification      repair_class NOT NULL,
                               damage_claim_id     INT REFERENCES damage_claims(id),
                               fault_description   TEXT,
                               received_at         TIMESTAMPTZ NOT NULL,
                               released_at         TIMESTAMPTZ,
                               odometer_at_intake  INT,
                               labor_cost          NUMERIC(14,2) NOT NULL DEFAULT 0,
                               parts_cost          NUMERIC(14,2) NOT NULL DEFAULT 0,
                               status              VARCHAR(20) NOT NULL DEFAULT 'OPEN',
                               CHECK (released_at IS NULL OR released_at >= received_at),
                               CHECK (classification <> 'POST_ACCIDENT' OR damage_claim_id IS NOT NULL),
                               FOREIGN KEY (workshop_id, workshop_type)
                                   REFERENCES parties (id, party_type)
);

-- =====================================================================
-- 10. SPARE PARTS CATALOG & WAREHOUSE
-- =====================================================================

CREATE TABLE part_categories (
                                 id              SERIAL PRIMARY KEY,
                                 code            VARCHAR(30) UNIQUE NOT NULL,
                                 name            VARCHAR(100) NOT NULL,
                                 parent_id       INT REFERENCES part_categories(id)
);

CREATE TABLE parts_catalog (
                               id                      SERIAL PRIMARY KEY,
                               oem_number              VARCHAR(80) UNIQUE NOT NULL,
                               name                    VARCHAR(200) NOT NULL,
                               category_id             INT REFERENCES part_categories(id),
                               unit_of_measure         VARCHAR(10) NOT NULL DEFAULT 'PCS',
                               min_stock_threshold     NUMERIC(12,2),
                               is_fluid                BOOLEAN NOT NULL DEFAULT FALSE,
                               is_tire                 BOOLEAN NOT NULL DEFAULT FALSE,
                               manufacturer            VARCHAR(100)
);

CREATE TABLE part_substitutes (
                                  original_part_id    INT NOT NULL REFERENCES parts_catalog(id) ON DELETE CASCADE,
                                  substitute_part_id  INT NOT NULL REFERENCES parts_catalog(id) ON DELETE CASCADE,
                                  notes               VARCHAR(255),
                                  PRIMARY KEY (original_part_id, substitute_part_id),
                                  CHECK (original_part_id <> substitute_part_id)
);

CREATE TABLE warehouse_locations (
                                     id              SERIAL PRIMARY KEY,
                                     base_id         INT NOT NULL REFERENCES bases(id),
                                     rack            VARCHAR(20) NOT NULL,
                                     shelf           VARCHAR(20) NOT NULL,
                                     bin             VARCHAR(20),
                                     UNIQUE (base_id, rack, shelf, bin)
);

CREATE TABLE inventory (
                           id                  SERIAL PRIMARY KEY,
                           part_id             INT NOT NULL REFERENCES parts_catalog(id),
                           location_id         INT NOT NULL REFERENCES warehouse_locations(id),
                           quantity            NUMERIC(12,2) NOT NULL DEFAULT 0,
                           last_counted_at     TIMESTAMPTZ,
                           UNIQUE (part_id, location_id),
                           CHECK (quantity >= 0)
);

CREATE TABLE repair_parts (
                              id                  SERIAL PRIMARY KEY,
                              repair_order_id     INT NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
                              part_id             INT NOT NULL REFERENCES parts_catalog(id),
                              location_id         INT REFERENCES warehouse_locations(id),
                              quantity            NUMERIC(10,2) NOT NULL,
                              unit_cost           NUMERIC(12,2) NOT NULL,
                              CHECK (quantity > 0)
);

-- =====================================================================
-- 11. TIRES (specialized parts with lifecycle tracking)
-- =====================================================================

CREATE TABLE tires (
                       id                  SERIAL PRIMARY KEY,
                       serial_number       VARCHAR(50) UNIQUE,
                       part_id             INT NOT NULL REFERENCES parts_catalog(id),
                       size                VARCHAR(30),
                       season              tire_season,
                       purchased_at        DATE,
                       initial_tread_mm    NUMERIC(4,1),
                       current_tread_mm    NUMERIC(4,1),
                       is_retired          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE tire_assignments (
                                  id                  SERIAL PRIMARY KEY,
                                  tire_id             INT NOT NULL REFERENCES tires(id),
                                  asset_id            INT NOT NULL REFERENCES assets(id),
                                  position            axle_position NOT NULL,
                                  mounted_at          DATE NOT NULL,
                                  mounted_odometer_km INT,
                                  dismounted_at       DATE,
                                  dismounted_odometer_km INT,
                                  reason              VARCHAR(100),
                                  CHECK (dismounted_at IS NULL OR dismounted_at >= mounted_at)
);

CREATE UNIQUE INDEX tire_open_assignment_uniq
    ON tire_assignments (tire_id)
    WHERE dismounted_at IS NULL;

-- =====================================================================
-- 12. MONITORING & ALERTS (JSONB parameters)
-- =====================================================================

-- `threshold_value` + `threshold_unit` cover simple rules.
-- `parameters` JSONB extends to compound rules. Example payloads:
--   {"combine": "OR", "thresholds": [{"unit":"DAYS","value":30},
--                                     {"unit":"KM","value":2000}],
--    "applies_to_service_types": ["OIL"]}
--   {"category_filter": ["FILTERS","OILS"], "below_pct_of_threshold": 100}
CREATE TABLE alert_rules (
                             id              SERIAL PRIMARY KEY,
                             name            VARCHAR(150) NOT NULL,
                             trigger_type    alert_trigger NOT NULL,
                             threshold_value INT NOT NULL,
                             threshold_unit  alert_threshold_unit NOT NULL,
                             parameters      JSONB,
                             is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                             description     TEXT
);

CREATE TABLE alert_rule_recipients (
                                       alert_rule_id   INT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
                                       role_id         INT NOT NULL REFERENCES roles(id),
                                       PRIMARY KEY (alert_rule_id, role_id)
);

CREATE TABLE alert_tasks (
                             id                      SERIAL PRIMARY KEY,
                             alert_rule_id           INT NOT NULL REFERENCES alert_rules(id),
                             asset_id                INT REFERENCES assets(id),
                             triggered_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                             status                  task_status NOT NULL DEFAULT 'PENDING',
                             assigned_to_user_id     INT REFERENCES users(id),
                             message                 TEXT,
                             resolved_at             TIMESTAMPTZ,
                             related_entity_type     VARCHAR(50),
                             related_entity_id       INT
);

-- =====================================================================
-- 13. SUPPORTING INDEXES
-- =====================================================================

CREATE INDEX idx_parties_party_type            ON parties (party_type);
CREATE INDEX idx_assets_base                   ON assets (current_base_id);
CREATE INDEX idx_documents_valid_until         ON documents (valid_until);
CREATE INDEX idx_documents_metadata_gin        ON documents USING gin (metadata);
CREATE INDEX idx_policies_ends_on              ON policies (ends_on);
CREATE INDEX idx_installments_due_date         ON policy_installments (due_date)
    WHERE paid_at IS NULL;
CREATE INDEX idx_inspections_next_due_on       ON inspections (next_due_on);
CREATE INDEX idx_inspections_findings_gin      ON inspections USING gin (findings);
CREATE INDEX idx_service_intervals_next        ON service_intervals
    (next_due_on, next_due_odometer_km);
CREATE INDEX idx_repair_orders_asset           ON repair_orders (asset_id, received_at DESC);
CREATE INDEX idx_inventory_low                 ON inventory (part_id, location_id);
CREATE INDEX idx_alert_rules_parameters_gin    ON alert_rules USING gin (parameters);
CREATE INDEX idx_alert_tasks_status            ON alert_tasks (status, triggered_at);

-- =====================================================================
-- 14. SAMPLE DATA
-- =====================================================================

-- ----- Bases -----
INSERT INTO bases (id, code, name, address_line, city) VALUES
                                                           (1, 'WAW', 'Baza Warszawa Główna', 'ul. Połczyńska 110', 'Warszawa'),
                                                           (2, 'POZ', 'Baza Poznań Komorniki',  'ul. Poznańska 25',   'Komorniki'),
                                                           (3, 'WRO', 'Baza Wrocław Bielany',   'ul. Czekoladowa 9',  'Wrocław');

-- ----- Roles & users -----
INSERT INTO roles (id, code, name, description) VALUES
                                                    (1, 'DISPATCHER',    'Dispatcher',    'Plans loads and orders, receives transport-related alerts'),
                                                    (2, 'FLEET_MANAGER', 'Fleet Manager', 'Oversees fleet readiness, compliance and budgets'),
                                                    (3, 'MECHANIC',      'Mechanic',      'Performs maintenance and repairs'),
                                                    (4, 'WAREHOUSE',     'Warehouse Keeper', 'Manages spare parts stock');

INSERT INTO users (id, email, full_name, role_id, base_id) VALUES
                                                               (1, 'a.kowalska@tms.example',   'Anna Kowalska',      2, 1),
                                                               (2, 'p.nowak@tms.example',      'Piotr Nowak',        1, 1),
                                                               (3, 'm.wisniewski@tms.example', 'Marek Wiśniewski',   3, 2),
                                                               (4, 'j.lewandowska@tms.example','Joanna Lewandowska', 4, 1);

-- ----- Parties (insurers, workshops, inspection stations) -----
INSERT INTO parties (id, party_type, legal_name, tax_id, city, contact_email, contact_phone) VALUES
                                                                                                 (1, 'INSURER',            'PZU SA',                            '5260008888', 'Warszawa', 'flota@pzu.pl',   '+48 22 566 55 55'),
                                                                                                 (2, 'INSURER',            'TUiR Warta',                        '5210105702', 'Warszawa', 'flota@warta.pl', '+48 502 308 308'),
                                                                                                 (3, 'WORKSHOP',           'TMS Warsztat Wewnętrzny WAW',       '5260999999', 'Warszawa', 'serwis@tms.example', '+48 22 111 22 33'),
                                                                                                 (4, 'WORKSHOP',           'Volvo Trucks Service Poznań',       '7770001122', 'Poznań',   'serwis.poznan@volvotrucks.pl', '+48 61 555 66 77'),
                                                                                                 (5, 'WORKSHOP',           'BlackTruck Naprawy Powypadkowe',    '7280112233', 'Łódź',     'biuro@blacktruck.pl', '+48 42 999 88 77'),
                                                                                                 (6, 'INSPECTION_STATION', 'OSKP nr WAW/123',                   NULL,         'Warszawa', 'skp@oskp123.pl',     '+48 22 333 44 55'),
                                                                                                 (7, 'INSPECTION_STATION', 'Auto-Serwis Tacho Poznań',          '7770556677', 'Poznań',   'tacho@autoserwis.pl','+48 61 888 99 00'),
                                                                                                 (8, 'INSPECTION_STATION', 'UDT Oddział Warszawa',              NULL,         'Warszawa', 'warszawa@udt.gov.pl','+48 22 572 21 00');

INSERT INTO workshop_details (party_id, is_internal) VALUES
                                                         (3, TRUE),
                                                         (4, FALSE),
                                                         (5, FALSE);

INSERT INTO inspection_station_details (party_id, station_code, accreditation) VALUES
                                                                                   (6, 'WAW/123',  'Okręgowa SKP'),
                                                                                   (7, 'POZ-T-12', 'Zatwierdzony warsztat tachografów'),
                                                                                   (8, 'UDT-WAW',  'Urząd Dozoru Technicznego');

-- ----- Lookups -----
INSERT INTO fuel_types (id, code, name) VALUES
                                            (1, 'DIESEL',  'Diesel'),
                                            (2, 'LNG',     'Liquefied Natural Gas'),
                                            (3, 'CNG',     'Compressed Natural Gas'),
                                            (4, 'BEV',     'Battery Electric');

INSERT INTO emission_standards (id, code, name, valid_from) VALUES
                                                                (1, 'EURO_5', 'Euro 5',  '2009-10-01'),
                                                                (2, 'EURO_6', 'Euro 6',  '2013-12-31'),
                                                                (3, 'EURO_6D','Euro 6d', '2020-01-01');

INSERT INTO body_types (id, code, name, description) VALUES
                                                         (1, 'REEFER',   'Refrigerated',  'Insulated body with active refrigeration unit (chłodnia)'),
                                                         (2, 'TARP',     'Tarpaulin',     'Standard tarpaulin-covered platform (plandeka)'),
                                                         (3, 'ISOTHERM', 'Isotherm',      'Insulated body without active cooling (izoterma)'),
                                                         (4, 'CURTAIN',  'Curtain-side',  'Curtain-sided body (firanka)');

INSERT INTO vehicle_makes (id, name, country_iso) VALUES
                                                      (1, 'Volvo',           'SE'),
                                                      (2, 'Mercedes-Benz',   'DE'),
                                                      (3, 'Scania',          'SE'),
                                                      (4, 'Schmitz Cargobull','DE'),
                                                      (5, 'Krone',           'DE');

INSERT INTO vehicle_models (id, make_id, name, asset_kind) VALUES
                                                               (1, 1, 'FH 460',            'VEHICLE'),
                                                               (2, 2, 'Actros 1845',       'VEHICLE'),
                                                               (3, 3, 'R 500',             'VEHICLE'),
                                                               (4, 4, 'S.KO COOL SMART',   'TRAILER'),
                                                               (5, 5, 'Profi Liner SDP 27','TRAILER');

-- ----- Assets -----
INSERT INTO assets (id, asset_kind, vin, registration_number, fleet_number, model_id,
                    year_of_manufacture, curb_weight_kg, gvw_kg, max_payload_kg,
                    current_base_id, in_service_since) VALUES
                                                           (1, 'VEHICLE', 'YV2RT40A1NB123456', 'WX 12345', 'T-001', 1, 2022, 7800.00, 18000.00, 10200.00, 1, '2022-06-01'),
                                                           (2, 'VEHICLE', 'WDB9634031L654321', 'WX 22222', 'T-002', 2, 2021, 8000.00, 18000.00, 10000.00, 2, '2021-09-15'),
                                                           (3, 'VEHICLE', 'XLER4X20009876543', 'PO 88888', 'T-003', 3, 2023, 7700.00, 18000.00, 10300.00, 2, '2023-03-20'),
                                                           (4, 'TRAILER', 'WSM00000005111222', 'WX TR111', 'N-101', 4, 2022, 7100.00, 39000.00, 31900.00, 1, '2022-06-10'),
                                                           (5, 'TRAILER', 'WKE00000007333444', 'WX TR222', 'N-102', 5, 2020, 6900.00, 39000.00, 32100.00, 3, '2020-08-01'),
                                                           (6, 'TRAILER', 'WSM00000008555666', 'WR TR333', 'N-103', 4, 2024, 7200.00, 39000.00, 31800.00, 3, '2024-01-15');

INSERT INTO vehicles (asset_id, engine_power_kw, engine_displacement_cm3,
                      fuel_type_id, emission_standard_id, current_odometer_km,
                      current_engine_hours_mth, avg_fuel_consumption_l_100km,
                      last_known_latitude, last_known_longitude, last_position_at) VALUES
                                                                                       (1, 338.00, 12800, 1, 3, 248500, 8420, 26.40, 52.232958, 21.006567, '2026-05-20 14:30:00+02'),
                                                                                       (2, 330.00, 12800, 1, 2, 412300, 14210, 28.10, 52.406376, 16.925167, '2026-05-21 09:15:00+02'),
                                                                                       (3, 368.00, 12740, 1, 3, 89200,  2980, 25.20, 52.405000, 16.925000, '2026-05-22 06:45:00+02');

INSERT INTO trailers (asset_id, body_type_id, euro_pallets_count, cargo_volume_m3,
                      interior_height_cm, has_tail_lift, has_refrigeration_unit,
                      has_temperature_sensors, min_temperature_c, max_temperature_c) VALUES
                                                                                         (4, 1, 33, 86.00, 270, FALSE, TRUE,  TRUE,  -25.0, 25.0),
                                                                                         (5, 4, 34, 91.50, 287, TRUE,  FALSE, FALSE, NULL,  NULL),
                                                                                         (6, 1, 33, 86.00, 270, FALSE, TRUE,  TRUE,  -25.0, 25.0);

-- ----- Document types & documents (with JSONB metadata) -----
INSERT INTO document_types (id, code, name, is_certificate, has_expiry) VALUES
                                                                            (1, 'REG_CERT',     'Dowód rejestracyjny',           FALSE, FALSE),
                                                                            (2, 'VEHICLE_CARD', 'Karta pojazdu',                  FALSE, FALSE),
                                                                            (3, 'ATP_CERT',     'Certyfikat ATP (chłodnia)',      TRUE,  TRUE),
                                                                            (4, 'WASTE_PERMIT', 'Zezwolenie na transport odpadów',TRUE,  TRUE);

INSERT INTO documents (id, asset_id, document_type_id, document_number,
                       issued_at, valid_until, issuing_authority, file_path, metadata) VALUES
                                                                                           (1, 1, 1, 'DR/2022/445566', '2022-06-01', NULL,         'Wydział Komunikacji Warszawa', '/dms/assets/1/reg.pdf', NULL),
                                                                                           (2, 4, 3, 'ATP/PL/2022/889','2022-06-10', '2028-06-09', 'CTL ITS Warszawa',             '/dms/assets/4/atp.pdf',
                                                                                            '{"atp_class": "FRC", "equipment_serial": "AGR-CAR450-XYZ", "validity_classes": ["FRC","FNA"], "ambient_temp_range_c": [-25, 25], "test_method": "ATP/RC"}'::jsonb),
                                                                                           (3, 6, 3, 'ATP/PL/2024/112','2024-01-12', '2030-01-11', 'CTL ITS Warszawa',             '/dms/assets/6/atp.pdf',
                                                                                            '{"atp_class": "FRC", "equipment_serial": "TKS-T1000R-AB12", "validity_classes": ["FRC","FNA","RRC"], "ambient_temp_range_c": [-30, 25]}'::jsonb);

-- ----- Insurance -----
INSERT INTO insurance_types (id, code, name, description) VALUES
                                                              (1, 'OC',     'OC posiadaczy pojazdów', 'Obowiązkowe ubezpieczenie odpowiedzialności cywilnej'),
                                                              (2, 'AC',     'Autocasco',              'Dobrowolne ubezpieczenie pojazdu'),
                                                              (3, 'ASSIST', 'Assistance',             'Pomoc drogowa i holowanie'),
                                                              (4, 'OCP',    'OC Przewoźnika',         'Ubezpieczenie odpowiedzialności cywilnej przewoźnika drogowego'),
                                                              (5, 'NNW',    'NNW kierowcy',           'Następstwa nieszczęśliwych wypadków');

-- insurer_id now references parties(id) where party_type='INSURER' (composite FK)
INSERT INTO policies (id, asset_id, insurer_id, policy_number, starts_on, ends_on,
                      sum_insured, total_premium) VALUES
                                                      (1, 1, 1, 'PZU/OC/2025/001', '2025-09-01', '2026-08-31', 350000.00, 8600.00),
                                                      (2, 2, 2, 'WAR/OC/2025/045', '2025-10-01', '2026-09-30', 320000.00, 9200.00),
                                                      (3, 3, 1, 'PZU/OCP/2025/77', '2025-04-01', '2026-03-31', 1500000.00, 14500.00);

INSERT INTO policy_coverages (policy_id, insurance_type_id, coverage_amount) VALUES
                                                                                 (1, 1, NULL), (1, 2, 350000.00), (1, 3, 10000.00),
                                                                                 (2, 1, NULL), (2, 2, 320000.00),
                                                                                 (3, 4, 1500000.00);

INSERT INTO policy_installments (policy_id, installment_no, amount, due_date, paid_at) VALUES
                                                                                           (1, 1, 4300.00, '2025-09-01', '2025-08-28'),
                                                                                           (1, 2, 4300.00, '2026-03-01', NULL),
                                                                                           (2, 1, 4600.00, '2025-10-01', '2025-09-29'),
                                                                                           (2, 2, 4600.00, '2026-04-01', NULL),
                                                                                           (3, 1, 14500.00,'2025-04-01', '2025-03-30');

-- ----- Inspections (with JSONB findings) -----
INSERT INTO inspection_types (id, code, name, default_interval_months, legal_basis) VALUES
                                                                                        (1, 'TACHOGRAPH', 'Kalibracja tachografu',           24, 'Rozporządzenie (UE) 165/2014'),
                                                                                        (2, 'TECHNICAL',  'Okresowe badanie techniczne SKP', 12, 'Ustawa Prawo o ruchu drogowym, art. 81'),
                                                                                        (3, 'UDT_LIFT',   'Dozór UDT - winda załadowcza',    24, 'Ustawa o dozorze technicznym');

-- station_id now references parties(id) where party_type='INSPECTION_STATION'
INSERT INTO inspections (asset_id, inspection_type_id, station_id, performed_on,
                         next_due_on, result, certificate_number, cost, findings) VALUES
                                                                                      (1, 1, 7, '2024-10-12', '2026-10-11', 'PASSED', 'TACHO/2024/0455', 480.00,
                                                                                       '{"k_factor": 8000, "w_factor": 8050, "l_value_mm": 3140, "speed_limit_kmh": 90, "vu_serial": "SE5000-12345", "sensor_serial": "MS-7891"}'::jsonb),
                                                                                      (1, 2, 6, '2025-09-01', '2026-08-31', 'PASSED', 'SKP/WAW/12345',   170.00,
                                                                                       '{"defect_codes": [], "remarks": "Pojazd w dobrym stanie technicznym"}'::jsonb),
                                                                                      (2, 2, 6, '2025-08-20', '2026-08-19', 'PASSED', 'SKP/WAW/12399',   170.00,
                                                                                       '{"defect_codes": ["A2.3.1"], "remarks": "Drobne zarysowania, dopuszczono"}'::jsonb),
                                                                                      (5, 3, 8, '2024-04-10', '2026-04-09', 'PASSED', 'UDT/W/2024/889',  620.00,
                                                                                       '{"max_load_kg": 1500, "load_test_passed": true, "load_test_load_kg": 1875, "deformation_mm": 0.2, "rope_condition": "GOOD", "hydraulic_pressure_bar": 180}'::jsonb),
                                                                                      (3, 2, 6, '2025-03-25', '2026-03-24', 'PASSED', 'SKP/WAW/13001',   170.00,
                                                                                       '{"defect_codes": [], "remarks": "Nowy pojazd, bez uwag"}'::jsonb);

-- ----- Service types & intervals -----
INSERT INTO service_types (id, code, name, description) VALUES
                                                            (1, 'OIL',            'Wymiana oleju silnikowego', 'Olej silnikowy + filtr'),
                                                            (2, 'WARRANTY',       'Przegląd gwarancyjny',      'Czynności wg planu producenta'),
                                                            (3, 'SEASONAL_TIRES', 'Sezonowa wymiana opon',     'Lato/zima'),
                                                            (4, 'GEARBOX',        'Wymiana oleju w skrzyni',   'Olej + filtr/sito');

INSERT INTO service_intervals (asset_id, service_type_id, basis, interval_value,
                               last_performed_on, last_performed_odometer_km,
                               next_due_on, next_due_odometer_km) VALUES
                                                                      (1, 1, 'MILEAGE_KM',  60000, '2025-11-10', 220000, NULL, 280000),
                                                                      (1, 3, 'TIME_MONTHS', 6,     '2025-10-20', NULL,   '2026-04-20', NULL),
                                                                      (2, 1, 'MILEAGE_KM',  60000, '2025-08-04', 380000, NULL, 440000),
                                                                      (2, 2, 'TIME_MONTHS', 12,    '2025-08-04', NULL,   '2026-08-04', NULL),
                                                                      (3, 1, 'MILEAGE_KM',  60000, '2025-12-05', 60000,  NULL, 120000);

-- ----- Damage claims & repair orders -----
INSERT INTO damage_claims (id, claim_number, policy_id, incident_date, description, estimated_loss) VALUES
    (1, 'WAR/2026/SZK/00112', 2, '2026-02-14', 'Kolizja z barierką na A2, uszkodzony zderzak i błotnik', 14500.00);

-- workshop_id now references parties(id) where party_type='WORKSHOP'
INSERT INTO repair_orders (id, order_number, asset_id, workshop_id, classification,
                           damage_claim_id, fault_description, received_at, released_at,
                           odometer_at_intake, labor_cost, parts_cost, status) VALUES
                                                                                   (1, 'RO-2025-001', 1, 3, 'POST_WARRANTY', NULL,
                                                                                    'Wymiana oleju i filtra wg planu, wymiana tarcz hamulcowych przedniej osi',
                                                                                    '2025-11-10 07:30:00+01', '2025-11-10 14:45:00+01', 220000, 380.00, 1620.00, 'CLOSED'),
                                                                                   (2, 'RO-2026-014', 2, 5, 'POST_ACCIDENT', 1,
                                                                                    'Naprawa po kolizji A2 - prostowanie zderzaka, lakierowanie',
                                                                                    '2026-02-17 09:00:00+01', NULL, 412300, 2400.00, 4100.00, 'IN_PROGRESS');

-- ----- Parts catalog & warehouse -----
INSERT INTO part_categories (id, code, name, parent_id) VALUES
                                                            (1, 'FILTERS',   'Filtry',                NULL),
                                                            (2, 'OILS',      'Oleje i płyny',         NULL),
                                                            (3, 'BRAKES',    'Układ hamulcowy',       NULL),
                                                            (4, 'TIRES',     'Opony',                 NULL),
                                                            (5, 'F_OIL',     'Filtry oleju',          1),
                                                            (6, 'F_FUEL',    'Filtry paliwa',         1);

INSERT INTO parts_catalog (id, oem_number, name, category_id, unit_of_measure,
                           min_stock_threshold, is_fluid, is_tire, manufacturer) VALUES
                                                                                     (1, 'VOL-FO-21707134',     'Filtr oleju Volvo FH', 5, 'PCS', 10, FALSE, FALSE, 'Volvo'),
                                                                                     (2, 'MB-FO-A4711800009',   'Filtr oleju Mercedes Actros', 5, 'PCS', 8, FALSE, FALSE, 'Mercedes-Benz'),
                                                                                     (3, 'CASTROL-VECTON-15W40','Olej silnikowy Castrol Vecton 15W-40', 2, 'L', 200, TRUE, FALSE, 'Castrol'),
                                                                                     (4, 'KNORR-K001928',       'Tarcza hamulcowa Knorr-Bremse', 3, 'PCS', 4, FALSE, FALSE, 'Knorr-Bremse'),
                                                                                     (5, 'MICHELIN-XMULTI-315-80-22.5','Opona Michelin X Multi 315/80 R22.5', 4, 'PCS', 4, FALSE, TRUE, 'Michelin'),
                                                                                     (6, 'CONTI-HDR3-315-80-22.5','Opona Continental Conti Hybrid HDR3 315/80 R22.5', 4, 'PCS', 4, FALSE, TRUE, 'Continental');

INSERT INTO part_substitutes (original_part_id, substitute_part_id, notes) VALUES
                                                                               (5, 6, 'Equivalent drive-axle tire of the same dimension'),
                                                                               (6, 5, 'Equivalent drive-axle tire of the same dimension');

INSERT INTO warehouse_locations (id, base_id, rack, shelf, bin) VALUES
                                                                    (1, 1, 'A1', '01', '01'),
                                                                    (2, 1, 'A1', '01', '02'),
                                                                    (3, 1, 'B2', '03', NULL),
                                                                    (4, 2, 'A1', '01', '01');

INSERT INTO inventory (part_id, location_id, quantity, last_counted_at) VALUES
                                                                            (1, 1, 12,  '2026-05-01 08:00:00+02'),
                                                                            (2, 1,  6,  '2026-05-01 08:00:00+02'),
                                                                            (3, 3, 180, '2026-05-01 08:00:00+02'),
                                                                            (4, 2,  8,  '2026-05-01 08:00:00+02'),
                                                                            (5, 4,  6,  '2026-05-01 08:00:00+02');

INSERT INTO repair_parts (repair_order_id, part_id, location_id, quantity, unit_cost) VALUES
                                                                                          (1, 1, 1, 1,  85.00),
                                                                                          (1, 3, 3, 30, 21.50),
                                                                                          (1, 4, 2, 2,  450.00);

-- ----- Tires & assignments -----
INSERT INTO tires (id, serial_number, part_id, size, season, purchased_at,
                   initial_tread_mm, current_tread_mm, is_retired) VALUES
                                                                       (1, 'MICH-AA001',  5, '315/80 R22.5', 'ALL_SEASON', '2024-09-15', 16.0, 12.4, FALSE),
                                                                       (2, 'MICH-AA002',  5, '315/80 R22.5', 'ALL_SEASON', '2024-09-15', 16.0, 12.1, FALSE),
                                                                       (3, 'CONTI-BB001', 6, '315/80 R22.5', 'ALL_SEASON', '2025-04-02', 16.0, 14.8, FALSE),
                                                                       (4, 'CONTI-BB002', 6, '315/80 R22.5', 'ALL_SEASON', '2025-04-02', 16.0, 14.7, FALSE);

INSERT INTO tire_assignments (tire_id, asset_id, position, mounted_at, mounted_odometer_km,
                              dismounted_at, dismounted_odometer_km, reason) VALUES
                                                                                 (1, 1, 'DRIVE_LEFT',       '2024-09-20', 180000, NULL,         NULL,    'Initial mount'),
                                                                                 (2, 1, 'DRIVE_RIGHT',      '2024-09-20', 180000, '2025-12-01', 245000, 'Rotation to trailer'),
                                                                                 (2, 4, 'TRAILER_AXLE_1_L', '2025-12-01', NULL,   NULL,         NULL,    'Rotated from tractor T-001'),
                                                                                 (3, 3, 'DRIVE_LEFT',       '2025-04-05', 10000,  NULL,         NULL,    'Initial mount'),
                                                                                 (4, 3, 'DRIVE_RIGHT',      '2025-04-05', 10000,  NULL,         NULL,    'Initial mount');

-- ----- Alert rules (with JSONB parameters) & tasks -----
INSERT INTO alert_rules (id, name, trigger_type, threshold_value, threshold_unit,
                         parameters, description) VALUES
                                                      (1, 'Policy ending in 30 days',         'POLICY_EXPIRY',    30,   'DAYS',
                                                       NULL,
                                                       'Notify before insurance policy ends'),
                                                      (2, 'Service due (30 days OR 2000 km)', 'SERVICE_INTERVAL', 2000, 'KM',
                                                       '{"combine": "OR", "thresholds": [{"unit":"DAYS","value":30},{"unit":"KM","value":2000}], "applies_to_service_types": ["OIL","WARRANTY"]}'::jsonb,
                                                       'Compound rule: trigger whichever comes first - calendar or mileage'),
                                                      (3, 'Technical inspection in 14 days',  'INSPECTION_DUE',   14,   'DAYS',
                                                       '{"inspection_type_codes": ["TECHNICAL","TACHOGRAPH"]}'::jsonb,
                                                       'Notify before SKP / tachograph deadline'),
                                                      (4, 'Document expiring in 30 days',     'DOCUMENT_EXPIRY',  30,   'DAYS',
                                                       '{"document_type_codes": ["ATP_CERT","WASTE_PERMIT"]}'::jsonb,
                                                       'Notify before document expiry (ATP, permit, ...)'),
                                                      (5, 'Low stock - filters & oils',       'STOCK_LOW',        0,    'QUANTITY',
                                                       '{"category_filter": ["FILTERS","OILS"], "below_pct_of_threshold": 100, "include_fluids": true}'::jsonb,
                                                       'Quantity below part-level minimum for filters and operating fluids');

INSERT INTO alert_rule_recipients (alert_rule_id, role_id) VALUES
                                                               (1, 2), (1, 1),
                                                               (2, 2), (2, 3),
                                                               (3, 2),
                                                               (4, 2),
                                                               (5, 4), (5, 2);

INSERT INTO alert_tasks (alert_rule_id, asset_id, triggered_at, status, assigned_to_user_id,
                         message, related_entity_type, related_entity_id) VALUES
                                                                              (2, 1, '2026-05-10 06:00:00+02', 'PENDING',     1, 'Vehicle T-001: oil service due in ~1500 km', 'SERVICE_INTERVAL', 1),
                                                                              (1, 1, '2026-07-02 06:00:00+02', 'PENDING',     1, 'Policy PZU/OC/2025/001 ends in 30 days',     'POLICY',           1),
                                                                              (5, NULL,'2026-05-15 06:00:00+02','IN_PROGRESS',4, 'Part Castrol Vecton 15W-40 below threshold (180 L < 200 L)', 'PART', 3);

-- ----- Reset sequences -----
SELECT setval('bases_id_seq',               (SELECT MAX(id) FROM bases));
SELECT setval('roles_id_seq',               (SELECT MAX(id) FROM roles));
SELECT setval('users_id_seq',               (SELECT MAX(id) FROM users));
SELECT setval('parties_id_seq',             (SELECT MAX(id) FROM parties));
SELECT setval('fuel_types_id_seq',          (SELECT MAX(id) FROM fuel_types));
SELECT setval('emission_standards_id_seq',  (SELECT MAX(id) FROM emission_standards));
SELECT setval('body_types_id_seq',          (SELECT MAX(id) FROM body_types));
SELECT setval('vehicle_makes_id_seq',       (SELECT MAX(id) FROM vehicle_makes));
SELECT setval('vehicle_models_id_seq',      (SELECT MAX(id) FROM vehicle_models));
SELECT setval('assets_id_seq',              (SELECT MAX(id) FROM assets));
SELECT setval('document_types_id_seq',      (SELECT MAX(id) FROM document_types));
SELECT setval('documents_id_seq',           (SELECT MAX(id) FROM documents));
SELECT setval('insurance_types_id_seq',     (SELECT MAX(id) FROM insurance_types));
SELECT setval('policies_id_seq',            (SELECT MAX(id) FROM policies));
SELECT setval('policy_installments_id_seq', (SELECT MAX(id) FROM policy_installments));
SELECT setval('inspection_types_id_seq',    (SELECT MAX(id) FROM inspection_types));
SELECT setval('inspections_id_seq',         (SELECT MAX(id) FROM inspections));
SELECT setval('service_types_id_seq',       (SELECT MAX(id) FROM service_types));
SELECT setval('service_intervals_id_seq',   (SELECT MAX(id) FROM service_intervals));
SELECT setval('damage_claims_id_seq',       (SELECT MAX(id) FROM damage_claims));
SELECT setval('repair_orders_id_seq',       (SELECT MAX(id) FROM repair_orders));
SELECT setval('part_categories_id_seq',     (SELECT MAX(id) FROM part_categories));
SELECT setval('parts_catalog_id_seq',       (SELECT MAX(id) FROM parts_catalog));
SELECT setval('warehouse_locations_id_seq', (SELECT MAX(id) FROM warehouse_locations));
SELECT setval('inventory_id_seq',           (SELECT MAX(id) FROM inventory));
SELECT setval('repair_parts_id_seq',        (SELECT MAX(id) FROM repair_parts));
SELECT setval('tires_id_seq',               (SELECT MAX(id) FROM tires));
SELECT setval('tire_assignments_id_seq',    (SELECT MAX(id) FROM tire_assignments));
SELECT setval('alert_rules_id_seq',         (SELECT MAX(id) FROM alert_rules));
SELECT setval('alert_tasks_id_seq',         (SELECT MAX(id) FROM alert_tasks));

COMMIT;