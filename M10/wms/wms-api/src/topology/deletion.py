"""Deletion: the one place where the topology touches the rest of the system.

The rule (section 7 of the design doc) is uniform - any trace on a shelf blocks:

    EXISTS (reservation on the shelf) OR EXISTS (record on the shelf)

The status predicate only decides *which message* comes back, never whether the
delete happens:

    in_use       reservation.status IN ('PENDING','ACTIVE') OR record still open
    has_history  otherwise
"""
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from topology.errors import ApiError
from topology.sql import SCOPES, SHELF_CODE, SHELF_JOIN

# How many blocked shelves are spelled out; blocked_count tells the whole truth.
BLOCKED_SAMPLE = 20

_BLOCKED_SHELVES = f"""
    SELECT * FROM (
        SELECT s.shelf_id,
               {SHELF_CODE} AS code,
               (SELECT count(*) FROM storage_reservation sr WHERE sr.shelf_id = s.shelf_id) AS reservations,
               (SELECT count(*) FROM storage_record rec WHERE rec.shelf_id = s.shelf_id) AS records,
               (SELECT count(*) FROM storage_reservation sr WHERE sr.shelf_id = s.shelf_id
                  AND sr.status IN ('PENDING','ACTIVE')) AS active_reservations,
               (SELECT count(*) FROM storage_record rec WHERE rec.shelf_id = s.shelf_id
                  AND rec.actual_exit_date IS NULL) AS open_records
        {SHELF_JOIN}
        WHERE {{scope}}
    ) traced
    WHERE reservations > 0 OR records > 0
    ORDER BY shelf_id
"""


def blocked_shelves(conn, level: str, entity_id: int) -> List[Dict[str, Any]]:
    """Every shelf under this node that carries a reservation or a record."""
    rows = conn.execute(text(_BLOCKED_SHELVES.format(scope=SCOPES[level])),
                        {'scope_id': entity_id}).mappings().all()
    blocked = []
    for row in rows:
        in_use = row['active_reservations'] > 0 or row['open_records'] > 0
        blocked.append({
            'shelf_id': row['shelf_id'],
            'code': row['code'],
            'reason': 'in_use' if in_use else 'has_history',
            'reservations': row['reservations'],
            'records': row['records'],
        })
    return blocked


_SCOPE_COLUMN = {'zone': 'z.zone_id', 'aisle': 'a.aisle_id', 'rack': 'r.rack_id'}


def would_delete(conn, level: str, entity_id: int) -> Dict[str, int]:
    """What the cascade would remove, counted before anything is written."""
    if level == 'shelf':
        return {'shelves': 1}
    row = conn.execute(
        text(f"""
            SELECT count(DISTINCT a.aisle_id) AS aisles,
                   count(DISTINCT r.rack_id) AS racks,
                   count(DISTINCT s.shelf_id) AS shelves
            FROM zone z
            LEFT JOIN aisle a ON a.zone_id = z.zone_id
            LEFT JOIN rack r ON r.aisle_id = a.aisle_id
            LEFT JOIN shelf s ON s.rack_id = r.rack_id
            WHERE {_SCOPE_COLUMN[level]} = :id
        """),
        {'id': entity_id},
    ).mappings().first()
    if level == 'zone':
        return {'zones': 1, 'aisles': row['aisles'], 'racks': row['racks'], 'shelves': row['shelves']}
    if level == 'aisle':
        return {'aisles': 1, 'racks': row['racks'], 'shelves': row['shelves']}
    return {'racks': 1, 'shelves': row['shelves']}


def child_count(conn, level: str, entity_id: int) -> int:
    child = {'zone': ('aisle', 'zone_id'), 'aisle': ('rack', 'aisle_id'), 'rack': ('shelf', 'rack_id')}[level]
    table, parent_fk = child
    return conn.execute(text(f'SELECT count(*) FROM {table} WHERE {parent_fk} = :id'),
                        {'id': entity_id}).scalar_one()


def blocked_payload(level: str, entity_id: int, label: str, blocked: List[Dict[str, Any]],
                    total_shelves: int, would: Dict[str, int]) -> Dict[str, Any]:
    """The 409 body: which rule fired, on how many shelves, and what it would have removed."""
    any_in_use = any(entry['reason'] == 'in_use' for entry in blocked)
    code = 'in_use' if any_in_use else 'has_history'
    if level == 'shelf':
        message = (f"Cannot delete shelf {label}: it is currently in use."
                   if any_in_use else
                   f"Cannot delete shelf {label}: it holds storage history.")
    else:
        what = 'are in use' if any_in_use else 'hold storage history'
        message = (f"Cannot delete {level} {label}: {len(blocked)} of {total_shelves} "
                   f"shelves {what}.")
    return {
        'error': code,
        'message': message,
        'blocked_count': len(blocked),
        'blocked_by': blocked[:BLOCKED_SAMPLE],
        'would_delete': would,
    }


def delete_subtree(conn, level: str, entity_id: int) -> None:
    """Delete the node and everything under it, bottom-up, on one transaction.

    The cascade is done here rather than by ON DELETE CASCADE in the database:
    a native cascade would run into the storage_record FK and answer with a raw
    Postgres error instead of the JSON envelope above.
    """
    if level == 'zone':
        conn.execute(text("""
            DELETE FROM shelf WHERE rack_id IN (
                SELECT r.rack_id FROM rack r JOIN aisle a ON a.aisle_id = r.aisle_id
                WHERE a.zone_id = :id)"""), {'id': entity_id})
        conn.execute(text("""
            DELETE FROM rack WHERE aisle_id IN (
                SELECT aisle_id FROM aisle WHERE zone_id = :id)"""), {'id': entity_id})
        conn.execute(text('DELETE FROM aisle WHERE zone_id = :id'), {'id': entity_id})
        conn.execute(text('DELETE FROM zone WHERE zone_id = :id'), {'id': entity_id})
    elif level == 'aisle':
        conn.execute(text("""
            DELETE FROM shelf WHERE rack_id IN (
                SELECT rack_id FROM rack WHERE aisle_id = :id)"""), {'id': entity_id})
        conn.execute(text('DELETE FROM rack WHERE aisle_id = :id'), {'id': entity_id})
        conn.execute(text('DELETE FROM aisle WHERE aisle_id = :id'), {'id': entity_id})
    elif level == 'rack':
        conn.execute(text('DELETE FROM shelf WHERE rack_id = :id'), {'id': entity_id})
        conn.execute(text('DELETE FROM rack WHERE rack_id = :id'), {'id': entity_id})
    else:
        conn.execute(text('DELETE FROM shelf WHERE shelf_id = :id'), {'id': entity_id})


CHILD_OF = {'zone': ('aisle', 'aisles'), 'aisle': ('rack', 'racks'), 'rack': ('shelf', 'shelves')}


def perform_delete(conn, level: str, entity_id: int, label: str,
                   cascade: bool, dry_run: bool) -> Optional[Dict[str, Any]]:
    """The whole delete policy, in the order the design doc states it.

    1. blocked by a reservation or a record?      -> 409 in_use / has_history
    2. has children and no ?cascade=true          -> 409 has_children
    3. ?dry_run=true                              -> {'would_delete': ...}, nothing written
    4. otherwise delete the subtree bottom-up     -> None (the caller answers 204)

    A dry run returns the status the real call would have returned, so it
    predicts rather than reassures.
    """
    would = would_delete(conn, level, entity_id)
    blocked = blocked_shelves(conn, level, entity_id)
    if blocked:
        payload = blocked_payload(level, entity_id, label, blocked, would['shelves'], would)
        raise ApiError(payload['error'], payload['message'], 409,
                       blocked_count=payload['blocked_count'],
                       blocked_by=payload['blocked_by'],
                       would_delete=payload['would_delete'])

    if level != 'shelf':
        _child_level, child_plural = CHILD_OF[level]
        children = child_count(conn, level, entity_id)
        if children and not cascade:
            raise ApiError(
                'has_children',
                f"{level.capitalize()} {label} still holds {children} {child_plural}.",
                409,
                child_counts={key: value for key, value in would.items() if key != level + 's'},
                hint='Repeat the call with ?cascade=true to delete the whole subtree.')

    if dry_run:
        return {'would_delete': would}

    delete_subtree(conn, level, entity_id)
    return None
