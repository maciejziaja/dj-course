-- 1. CZYSZCZENIE SCHEMATU
DROP TABLE IF EXISTS alert_tasks CASCADE;
DROP TABLE IF EXISTS alert_rules CASCADE;
DROP TABLE IF EXISTS inventory_levels CASCADE;
DROP TABLE IF EXISTS work_order_parts CASCADE;
DROP TABLE IF EXISTS work_orders CASCADE;
DROP TABLE IF EXISTS service_intervals CASCADE;
DROP TABLE IF EXISTS policy_installments CASCADE;
DROP TABLE IF EXISTS asset_documents CASCADE;
DROP TABLE IF EXISTS parts CASCADE;
DROP TABLE IF EXISTS fleet_assets CASCADE;

DROP TYPE IF EXISTS asset_category CASCADE;
DROP TYPE IF EXISTS document_type CASCADE;
DROP TYPE IF EXISTS repair_class CASCADE;
DROP TYPE IF EXISTS alert_trigger CASCADE;
DROP TYPE IF EXISTS alert_role CASCADE;
DROP TYPE IF EXISTS task_status CASCADE;

-- 2. TYPY WYLICZENIOWE
CREATE TYPE asset_category AS ENUM ('TRACTOR', 'TRAILER', 'TRUCK', 'VAN');
CREATE TYPE document_type AS ENUM ('REGISTRATION', 'INSURANCE_OC', 'INSURANCE_AC', 'INSURANCE_OCP', 'TACHOGRAPH', 'TECH_INSPECTION', 'UDT', 'ATP', 'WASTE_TRANSPORT');
CREATE TYPE repair_class AS ENUM ('WARRANTY', 'POST_WARRANTY', 'POST_ACCIDENT');
CREATE TYPE alert_trigger AS ENUM ('DAYS_BEFORE_EXPIRY', 'KM_BEFORE_SERVICE', 'STOCK_BELOW_MIN');
CREATE TYPE alert_role AS ENUM ('DISPATCHER', 'FLEET_MANAGER', 'MECHANIC');
CREATE TYPE task_status AS ENUM ('PENDING', 'IN_PROGRESS', 'ARCHIVED');

-- 3. DEFINICJE TABEL
CREATE TABLE fleet_assets (
                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              category asset_category NOT NULL,
                              vin VARCHAR(17) UNIQUE NOT NULL,
                              registration_plate VARCHAR(20) UNIQUE NOT NULL,
                              fleet_number VARCHAR(50) UNIQUE,
                              current_mileage INT DEFAULT 0,
                              average_fuel_consumption DECIMAL(5,2),
                              current_base_location VARCHAR(100),
                              specs JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE asset_documents (
                                 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                 asset_id UUID REFERENCES fleet_assets(id) ON DELETE CASCADE,
                                 document_type document_type NOT NULL,
                                 document_number VARCHAR(100),
                                 issuer_name VARCHAR(150),
                                 valid_from DATE,
                                 valid_to DATE,
                                 document_url VARCHAR(255),
                                 metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE policy_installments (
                                     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                     document_id UUID REFERENCES asset_documents(id) ON DELETE CASCADE,
                                     due_date DATE NOT NULL,
                                     amount_pln DECIMAL(10,2) NOT NULL,
                                     is_paid BOOLEAN DEFAULT FALSE
);

CREATE TABLE parts (
                       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                       oem_number VARCHAR(100) UNIQUE NOT NULL,
                       replacement_number VARCHAR(100),
                       name VARCHAR(200) NOT NULL,
                       category VARCHAR(50),
                       min_stock_level INT DEFAULT 0
);

CREATE TABLE inventory_levels (
                                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                  part_id UUID REFERENCES parts(id) ON DELETE CASCADE,
                                  rack VARCHAR(50),
                                  shelf VARCHAR(50),
                                  quantity INT DEFAULT 0,
                                  UNIQUE(part_id, rack, shelf)
);

CREATE TABLE service_intervals (
                                   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                   asset_id UUID REFERENCES fleet_assets(id) ON DELETE CASCADE,
                                   service_type VARCHAR(100) NOT NULL,
                                   interval_km INT,
                                   interval_mth INT,
                                   interval_days INT
);

CREATE TABLE work_orders (
                             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                             asset_id UUID REFERENCES fleet_assets(id),
                             repair_class repair_class NOT NULL,
                             damage_number VARCHAR(100),
                             date_received DATE NOT NULL,
                             date_released DATE,
                             description TEXT,
                             labor_cost_pln DECIMAL(10,2) DEFAULT 0
);

CREATE TABLE work_order_parts (
                                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
                                  part_id UUID REFERENCES parts(id),
                                  quantity INT NOT NULL,
                                  usage_details JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE alert_rules (
                             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                             trigger alert_trigger NOT NULL,
                             threshold_value INT NOT NULL,
                             target_role alert_role NOT NULL,
                             description_template VARCHAR(255)
);

CREATE TABLE alert_tasks (
                             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                             rule_id UUID REFERENCES alert_rules(id),
                             reference_id UUID,
                             reference_type VARCHAR(50),
                             status task_status DEFAULT 'PENDING',
                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRZYKŁADOWE DANE (INSERTS)

-- Zasoby (Ciągnik i Naczepa)
INSERT INTO fleet_assets (id, category, vin, registration_plate, fleet_number, current_mileage, average_fuel_consumption, current_base_location, specs) VALUES
                                                                                                                                                            ('a1111111-1111-1111-1111-111111111111', 'TRACTOR', 'WMA1234567890ABCD', 'WA 12345', 'T-001', 125000, 24.5, 'Baza Warszawa',
                                                                                                                                                             '{"engine_power_hp": 460, "engine_capacity_cm3": 12900, "fuel_type": "Diesel", "euro_norm": "Euro 6", "curb_weight_kg": 8500, "max_weight_kg": 40000}'),
                                                                                                                                                            ('a2222222-2222-2222-2222-222222222222', 'TRAILER', 'TRA9876543210ZYXW', 'WA 54321', 'TR-001', 0, 0, 'Baza Warszawa',
                                                                                                                                                             '{"body_type": "chłodnia", "europallets": 33, "volume_m3": 85, "internal_height_cm": 265, "curb_weight_kg": 7500, "payload_kg": 24500, "equipment": ["agregat_chłodniczy", "winda_załadowcza", "czujnik_temperatury"]}');

-- Dokumenty (Polisa OC + Certyfikat ATP)
INSERT INTO asset_documents (id, asset_id, document_type, document_number, issuer_name, valid_from, valid_to, document_url, metadata) VALUES
                                                                                                                                          ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'INSURANCE_OC', 'POL/2026/001', 'PZU', '2026-01-01', '2026-12-31', 'https://s3.tms.com/docs/pol_001.pdf',
                                                                                                                                           '{"assistance_level": "VIP Europe", "deductible_pln": 1000}'),
                                                                                                                                          ('d2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'ATP', 'ATP/2025/12', 'Instytut Chłodnictwa', '2025-06-01', '2028-06-01', 'https://s3.tms.com/docs/atp_001.pdf',
                                                                                                                                           '{"class": "FRC", "isolation": "Heavy"}');

-- Raty polisy OC
INSERT INTO policy_installments (document_id, due_date, amount_pln, is_paid) VALUES
                                                                                 ('d1111111-1111-1111-1111-111111111111', '2026-01-01', 2500.00, TRUE),
                                                                                 ('d1111111-1111-1111-1111-111111111111', '2026-07-01', 2500.00, FALSE);

-- Części w magazynie (Opona i Filtr)
INSERT INTO parts (id, oem_number, replacement_number, name, category, min_stock_level) VALUES
                                                                                            ('p1111111-1111-1111-1111-111111111111', 'OEM-TIRE-315/70', 'MICHELIN-X-MULTI', 'Opona Napędowa 315/70 R22.5', 'OPONY', 4),
                                                                                            ('p2222222-2222-2222-2222-222222222222', 'OEM-OIL-FIL-1', 'BOSCH-OF-12', 'Filtr Oleju Silnika', 'FILTRY', 10);

-- Lokalizacja części na półkach
INSERT INTO inventory_levels (part_id, rack, shelf, quantity) VALUES
                                                                  ('p1111111-1111-1111-1111-111111111111', 'A1', 'Podłoga', 8),
                                                                  ('p2222222-2222-2222-2222-222222222222', 'B2', 'Półka-3', 15);

-- Interwały Serwisowe
INSERT INTO service_intervals (asset_id, service_type, interval_km, interval_mth, interval_days) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'Przegląd Olejowy', 80000, NULL, 365);

-- Zlecenie Warsztatowe
INSERT INTO work_orders (id, asset_id, repair_class, damage_number, date_received, date_released, description, labor_cost_pln) VALUES
    ('w1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'POST_WARRANTY', NULL, '2026-05-20', '2026-05-21', 'Wymiana oleju i wymiana przebitej opony', 450.00);

-- Zużycie części do zlecenia
INSERT INTO work_order_parts (work_order_id, part_id, quantity, usage_details) VALUES
                                                                                   ('w1111111-1111-1111-1111-111111111111', 'p2222222-2222-2222-2222-222222222222', 1, '{}'),
                                                                                   ('w1111111-1111-1111-1111-111111111111', 'p1111111-1111-1111-1111-111111111111', 1,
                                                                                    '{"season": "wielosezonowa", "tread_mm": 18, "axle_position": "drive_left_outer"}');

-- Reguła Alerta
INSERT INTO alert_rules (id, trigger, threshold_value, target_role, description_template) VALUES
    ('r1111111-1111-1111-1111-111111111111', 'DAYS_BEFORE_EXPIRY', 30, 'FLEET_MANAGER', 'Kończy się ważność dokumentu dla pojazdu.');