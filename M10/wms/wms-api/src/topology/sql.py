"""SQL fragments shared by the topology routes.

Two things live here because they would otherwise be retyped in a dozen places:
the shelf -> rack -> aisle -> zone -> warehouse join, and the composed shelf
code. The code is never stored - it is composed on read, and it is unique by
construction because every level is unique within its parent.
"""
from typing import Dict

# The full chain upwards from a shelf.
SHELF_JOIN = """
    FROM shelf s
    JOIN rack r ON r.rack_id = s.rack_id
    JOIN aisle a ON a.aisle_id = r.aisle_id
    JOIN zone z ON z.zone_id = a.zone_id
    JOIN warehouse w ON w.warehouse_id = z.warehouse_id
"""

# A-01-R001-L4
SHELF_CODE = "z.code || '-' || a.label || '-' || r.label || '-L' || s.level"

# "all shelves under X", written once. Every scope is expressed against SHELF_JOIN.
SCOPES: Dict[str, str] = {
    'warehouse': 'w.warehouse_id = :scope_id',
    'zone': 'z.zone_id = :scope_id',
    'aisle': 'a.aisle_id = :scope_id',
    'rack': 'r.rack_id = :scope_id',
    'shelf': 's.shelf_id = :scope_id',
}
