-- ============================================================
-- STEP 1: Storage hierarchy FK join indexes
-- Fixes sequential scans in the warehouse → zone → aisle → rack → shelf chain
-- Used by: shelf utilization query (Q2)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shelf_rack_id
    ON public.shelf (rack_id);

CREATE INDEX IF NOT EXISTS idx_rack_aisle_id
    ON public.rack (aisle_id);

CREATE INDEX IF NOT EXISTS idx_aisle_zone_id
    ON public.aisle (zone_id);

CREATE INDEX IF NOT EXISTS idx_zone_warehouse_id
    ON public.zone (warehouse_id);


-- ============================================================
-- STEP 2: Active storage record lookup by shelf
-- Partial index targets only records still in storage (no exit date yet),
-- which is the typical filter in utilization queries
-- Used by: shelf utilization query (Q2)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_storage_record_shelf_id_active
    ON public.storage_record (shelf_id)
    WHERE actual_exit_date IS NULL;


-- ============================================================
-- STEP 3: Storage event history by employee
-- Fixes a full sequential scan on a 500k+ row table joined by employee_id
-- Used by: employee event ranking query (Q3)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_storage_event_history_employee_id
    ON public.storage_event_history (employee_id);


-- ============================================================
-- STEP 4: Fix reversed contact lookup index
-- idx_contact_lookup(details, type) is useless when filtering by type alone
-- because type is the non-leading column. Recreate with (type, details)
-- so queries like WHERE type = 'email' can use an index scan.
-- Used by: customer revenue query (Q1)
-- ============================================================

DROP INDEX IF EXISTS public.idx_contact_lookup;

CREATE INDEX IF NOT EXISTS idx_contact_lookup
    ON public.customer_contact (type, details);


-- ============================================================
-- EXAMPLE QUERIES
-- ============================================================

-- Q1: Top customers by total revenue with primary email contact
-- Indexes used: idx_customer_is_deleted, idx_payment_customer_date,
--               idx_customer_contact_customer_id, idx_contact_lookup (type, details)
SELECT
    c.customer_id,
    c.name,
    c.status,
    cc.details AS primary_contact,
    COUNT(DISTINCT p.payment_id) AS payment_count,
    SUM(p.amount) AS total_revenue,
    MAX(p.payment_date) AS last_payment_date
FROM customer c
JOIN payment p ON p.customer_id = c.customer_id
LEFT JOIN customer_contact cc
    ON cc.customer_id = c.customer_id AND cc.type = 'email'
WHERE c.is_deleted = false
  AND p.status = 'completed'
GROUP BY c.customer_id, c.name, c.status, cc.details
ORDER BY total_revenue DESC
LIMIT 10;


-- Q2: Shelf utilization — weight used vs max capacity for active storage records
-- Indexes used: idx_shelf_rack_id, idx_rack_aisle_id, idx_aisle_zone_id,
--               idx_zone_warehouse_id, idx_storage_record_shelf_id_active
SELECT
    w.name AS warehouse,
    z.name AS zone,
    a.label AS aisle,
    s.shelf_id,
    s.level,
    s.max_weight,
    COALESCE(SUM(sr.cargo_weight), 0) AS used_weight,
    ROUND(COALESCE(SUM(sr.cargo_weight), 0) / NULLIF(s.max_weight, 0) * 100, 1) AS utilization_pct
FROM shelf s
JOIN rack r ON r.rack_id = s.rack_id
JOIN aisle a ON a.aisle_id = r.aisle_id
JOIN zone z ON z.zone_id = a.zone_id
JOIN warehouse w ON w.warehouse_id = z.warehouse_id
LEFT JOIN storage_record sr
    ON sr.shelf_id = s.shelf_id AND sr.actual_exit_date IS NULL
GROUP BY w.name, z.name, a.label, s.shelf_id, s.level, s.max_weight
ORDER BY utilization_pct DESC NULLS LAST;


-- Q3: Employees ranked by storage events handled per warehouse (window functions)
-- Indexes used: idx_employee_is_deleted, employee_warehouse_pkey,
--               idx_storage_event_history_employee_id, warehouse_pkey
WITH event_counts AS (
    SELECT
        ew.warehouse_id,
        w.name AS warehouse_name,
        e.employee_id,
        e.name AS employee_name,
        COUNT(seh.event_id) AS events_handled
    FROM employee e
    JOIN storage_event_history seh ON seh.employee_id = e.employee_id
    JOIN employee_warehouse ew
        ON ew.employee_id = e.employee_id
        AND seh.event_time BETWEEN ew.assigned_from AND COALESCE(ew.assigned_until, NOW())
    JOIN warehouse w ON w.warehouse_id = ew.warehouse_id
    WHERE e.is_deleted = false
    GROUP BY ew.warehouse_id, w.name, e.employee_id, e.name
)
SELECT
    warehouse_name,
    employee_name,
    events_handled,
    RANK() OVER (PARTITION BY warehouse_id ORDER BY events_handled DESC) AS rank_in_warehouse,
    SUM(events_handled) OVER (PARTITION BY warehouse_id) AS warehouse_total_events
FROM event_counts
ORDER BY warehouse_name, rank_in_warehouse;
