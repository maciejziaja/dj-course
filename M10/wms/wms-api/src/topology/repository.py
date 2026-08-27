"""Data access for the topology, and the response shapes that go with it.

Thin on purpose: SQL in, dicts out. Anything that decides *whether* something may
happen lives in the routes (validation) or in `deletion.py` (blocking rules).
"""
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import text

from topology.errors import ApiError
from topology.measures import measure_out
from topology.sql import SHELF_CODE, SHELF_JOIN

# How many rows go into a single multi-row INSERT.
INSERT_BATCH = 500

_PATCHABLE = {
    'warehouse': ('name', 'description', 'location_id'),
    'zone': ('code', 'name', 'description'),
    'aisle': ('label', 'width', 'width_unit'),
    'rack': ('label', 'max_height', 'height_unit'),
    'shelf': ('level', 'max_weight', 'max_volume'),
}
_TABLE = {
    'warehouse': ('warehouse', 'warehouse_id'),
    'zone': ('zone', 'zone_id'),
    'aisle': ('aisle', 'aisle_id'),
    'rack': ('rack', 'rack_id'),
    'shelf': ('shelf', 'shelf_id'),
}


# --- response shapes ------------------------------------------------------

def _stamp(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'created_at': row['created_at'].isoformat() if row.get('created_at') else None,
        'updated_at': row['updated_at'].isoformat() if row.get('updated_at') else None,
    }


def location_out(row) -> Dict[str, Any]:
    return {
        'id': row['location_id'],
        'address': row['address'],
        'city': row['city'],
        'postal_code': row['postal_code'],
        'country': row['country'],
    }


def warehouse_out(row) -> Dict[str, Any]:
    out = {
        'id': row['warehouse_id'],
        'name': row['name'],
        'description': row['description'],
        'location': location_out(row) if row.get('location_id') else None,
    }
    out.update(_stamp(row))
    return out


def zone_out(row) -> Dict[str, Any]:
    out = {
        'id': row['zone_id'],
        'warehouse_id': row['warehouse_id'],
        'code': row['code'],
        'name': row['name'],
        'description': row['description'],
    }
    out.update(_stamp(row))
    return out


def aisle_out(row) -> Dict[str, Any]:
    out = {
        'id': row['aisle_id'],
        'zone_id': row['zone_id'],
        'label': row['label'],
        'width': measure_out(row['width'], row['width_unit']),
    }
    out.update(_stamp(row))
    return out


def rack_out(row) -> Dict[str, Any]:
    out = {
        'id': row['rack_id'],
        'aisle_id': row['aisle_id'],
        'label': row['label'],
        'max_height': measure_out(row['max_height'], row['height_unit']),
    }
    out.update(_stamp(row))
    return out


def shelf_out(row) -> Dict[str, Any]:
    out = {
        'id': row['shelf_id'],
        'rack_id': row['rack_id'],
        'level': row['level'],
        'code': row.get('code'),
        'max_weight': measure_out(row['max_weight'], 'kg'),
        'max_volume': measure_out(row['max_volume'], 'm3'),
    }
    if 'warehouse_id' in row.keys():
        out['warehouse_id'] = row['warehouse_id']
        out['zone'] = {'id': row['zone_id'], 'code': row['zone_code']}
        out['aisle'] = {'id': row['aisle_id'], 'label': row['aisle_label']}
        out['rack'] = {'id': row['rack_id'], 'label': row['rack_label']}
    out.update(_stamp(row))
    return out


# --- generic single-row access -------------------------------------------

def get_row(conn, level: str, entity_id: int):
    table, pk = _TABLE[level]
    row = conn.execute(text(f'SELECT * FROM {table} WHERE {pk} = :id'), {'id': entity_id}).mappings().first()
    return row


def require_row(conn, level: str, entity_id: int):
    row = get_row(conn, level, entity_id)
    if row is None:
        raise ApiError('not_found', f'{level.capitalize()} {entity_id} not found.', 404)
    return row


def patch_row(conn, level: str, entity_id: int, columns: Dict[str, Any]):
    """Dynamic SET built from the fields the caller actually sent."""
    table, pk = _TABLE[level]
    allowed = _PATCHABLE[level]
    unknown = [column for column in columns if column not in allowed]
    if unknown:
        raise ApiError('invalid_body', f"Cannot patch {', '.join(unknown)} on a {level}.", 400)
    assignments = ', '.join(f'{column} = :{column}' for column in columns)
    params = dict(columns)
    params['id'] = entity_id
    row = conn.execute(
        text(f'UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP '
             f'WHERE {pk} = :id RETURNING *'),
        params,
    ).mappings().first()
    if row is None:
        raise ApiError('not_found', f'{level.capitalize()} {entity_id} not found.', 404)
    return row


# --- locations ------------------------------------------------------------

def list_locations(conn, city: Optional[str], country: Optional[str], q: Optional[str],
                   limit: int, offset: int):
    where, params = [], {}
    if city:
        where.append('city ILIKE :city')
        params['city'] = city
    if country:
        where.append('country ILIKE :country')
        params['country'] = country
    if q:
        where.append('(address ILIKE :q OR city ILIKE :q OR postal_code ILIKE :q)')
        params['q'] = f'%{q}%'
    clause = ('WHERE ' + ' AND '.join(where)) if where else ''
    total = conn.execute(text(f'SELECT count(*) FROM location {clause}'), params).scalar_one()
    rows = conn.execute(
        text(f'SELECT * FROM location {clause} ORDER BY location_id LIMIT :limit OFFSET :offset'),
        dict(params, limit=limit, offset=offset),
    ).mappings().all()
    return rows, total


def location_exists(conn, location_id: int) -> bool:
    return conn.execute(text('SELECT 1 FROM location WHERE location_id = :id'),
                        {'id': location_id}).first() is not None


def insert_location(conn, data: Dict[str, Any]) -> int:
    return conn.execute(
        text('INSERT INTO location (address, city, postal_code, country) '
             'VALUES (:address, :city, :postal_code, :country) RETURNING location_id'),
        data,
    ).scalar_one()


# --- warehouses -----------------------------------------------------------

_WAREHOUSE_SELECT = """
    SELECT w.warehouse_id, w.name, w.description, w.created_at, w.updated_at,
           l.location_id, l.address, l.city, l.postal_code, l.country
    FROM warehouse w
    LEFT JOIN location l ON l.location_id = w.location_id
"""


def get_warehouse(conn, warehouse_id: int):
    return conn.execute(text(_WAREHOUSE_SELECT + ' WHERE w.warehouse_id = :id'),
                        {'id': warehouse_id}).mappings().first()


def list_warehouses(conn, city: Optional[str], country: Optional[str], q: Optional[str],
                    limit: int, offset: int):
    where, params = [], {}
    if city:
        where.append('l.city ILIKE :city')
        params['city'] = city
    if country:
        where.append('l.country ILIKE :country')
        params['country'] = country
    if q:
        where.append('(w.name ILIKE :q OR w.description ILIKE :q OR l.address ILIKE :q OR l.city ILIKE :q)')
        params['q'] = f'%{q}%'
    clause = ('WHERE ' + ' AND '.join(where)) if where else ''
    total = conn.execute(
        text('SELECT count(*) FROM warehouse w LEFT JOIN location l '
             f'ON l.location_id = w.location_id {clause}'), params).scalar_one()
    rows = conn.execute(
        text(f'{_WAREHOUSE_SELECT} {clause} ORDER BY w.warehouse_id LIMIT :limit OFFSET :offset'),
        dict(params, limit=limit, offset=offset),
    ).mappings().all()
    return rows, total


def insert_warehouse(conn, location_id: int, name: str, description: Optional[str]) -> int:
    return conn.execute(
        text('INSERT INTO warehouse (location_id, name, description) '
             'VALUES (:location_id, :name, :description) RETURNING warehouse_id'),
        {'location_id': location_id, 'name': name, 'description': description},
    ).scalar_one()


# --- children listings ----------------------------------------------------

_CHILD_QUERY = {
    'zone': ('SELECT * FROM zone WHERE warehouse_id = :parent_id ORDER BY code',
             'SELECT count(*) FROM zone WHERE warehouse_id = :parent_id'),
    'aisle': ('SELECT * FROM aisle WHERE zone_id = :parent_id ORDER BY label',
              'SELECT count(*) FROM aisle WHERE zone_id = :parent_id'),
    'rack': ('SELECT * FROM rack WHERE aisle_id = :parent_id ORDER BY label',
             'SELECT count(*) FROM rack WHERE aisle_id = :parent_id'),
    'shelf': ('SELECT * FROM shelf WHERE rack_id = :parent_id ORDER BY level',
              'SELECT count(*) FROM shelf WHERE rack_id = :parent_id'),
}


def list_children(conn, level: str, parent_id: int, limit: int, offset: int):
    select_sql, count_sql = _CHILD_QUERY[level]
    total = conn.execute(text(count_sql), {'parent_id': parent_id}).scalar_one()
    rows = conn.execute(text(f'{select_sql} LIMIT :limit OFFSET :offset'),
                        {'parent_id': parent_id, 'limit': limit, 'offset': offset}).mappings().all()
    return rows, total


# --- flat shelf catalogue -------------------------------------------------

def list_shelves(conn, filters: Dict[str, Any], limit: int, offset: int):
    where, params = [], {}
    if filters.get('warehouse') is not None:
        where.append('w.warehouse_id = :warehouse')
        params['warehouse'] = filters['warehouse']
    if filters.get('zone'):
        where.append('z.code ILIKE :zone')
        params['zone'] = filters['zone']
    if filters.get('aisle'):
        where.append('a.label ILIKE :aisle')
        params['aisle'] = filters['aisle']
    if filters.get('rack'):
        where.append('r.label ILIKE :rack')
        params['rack'] = filters['rack']
    if filters.get('level'):
        where.append('s.level = :level')
        params['level'] = filters['level']
    if filters.get('code'):
        where.append(f'({SHELF_CODE}) ILIKE :code')
        params['code'] = filters['code']
    if filters.get('max_weight_gte') is not None:
        where.append('s.max_weight >= :max_weight_gte')
        params['max_weight_gte'] = filters['max_weight_gte']
    if filters.get('max_volume_gte') is not None:
        where.append('s.max_volume >= :max_volume_gte')
        params['max_volume_gte'] = filters['max_volume_gte']
    clause = ('WHERE ' + ' AND '.join(where)) if where else ''

    total = conn.execute(text(f'SELECT count(*) {SHELF_JOIN} {clause}'), params).scalar_one()
    rows = conn.execute(
        text(f"""
            SELECT s.shelf_id, s.rack_id, s.level, s.max_weight, s.max_volume,
                   s.created_at, s.updated_at,
                   {SHELF_CODE} AS code,
                   w.warehouse_id, z.zone_id, z.code AS zone_code,
                   a.aisle_id, a.label AS aisle_label,
                   r.label AS rack_label
            {SHELF_JOIN} {clause}
            ORDER BY z.code, a.label, r.label, s.level
            LIMIT :limit OFFSET :offset
        """),
        dict(params, limit=limit, offset=offset),
    ).mappings().all()
    return rows, total


def get_shelf_with_path(conn, shelf_id: int):
    return conn.execute(
        text(f"""
            SELECT s.shelf_id, s.rack_id, s.level, s.max_weight, s.max_volume,
                   s.created_at, s.updated_at, {SHELF_CODE} AS code
            {SHELF_JOIN}
            WHERE s.shelf_id = :id
        """),
        {'id': shelf_id},
    ).mappings().first()


def shelf_codes(conn, shelf_ids: Sequence[int]) -> Dict[int, str]:
    if not shelf_ids:
        return {}
    rows = conn.execute(
        text(f'SELECT s.shelf_id, {SHELF_CODE} AS code {SHELF_JOIN} '
             'WHERE s.shelf_id = ANY(:ids)'),
        {'ids': list(shelf_ids)},
    ).mappings().all()
    return {row['shelf_id']: row['code'] for row in rows}


# --- counts ---------------------------------------------------------------

_COUNT_SCOPE = {
    'warehouse': 'z.warehouse_id = :id',
    'zone': 'z.zone_id = :id',
    'aisle': 'a.aisle_id = :id',
    'rack': 'r.rack_id = :id',
}


def counts_under(conn, level: str, entity_id: int) -> Dict[str, int]:
    """How many aisles / racks / shelves live under this node."""
    row = conn.execute(
        text(f"""
            SELECT count(DISTINCT a.aisle_id) AS aisles,
                   count(DISTINCT r.rack_id) AS racks,
                   count(DISTINCT s.shelf_id) AS shelves
            FROM zone z
            LEFT JOIN aisle a ON a.zone_id = z.zone_id
            LEFT JOIN rack r ON r.aisle_id = a.aisle_id
            LEFT JOIN shelf s ON s.rack_id = r.rack_id
            WHERE {_COUNT_SCOPE[level]}
        """),
        {'id': entity_id},
    ).mappings().first()
    counts = {'aisles': row['aisles'], 'racks': row['racks'], 'shelves': row['shelves']}
    if level == 'warehouse':
        counts['zones'] = conn.execute(
            text('SELECT count(*) FROM zone WHERE warehouse_id = :id'), {'id': entity_id}).scalar_one()
    if level == 'aisle':
        counts.pop('aisles')
    if level == 'rack':
        counts.pop('aisles')
        counts.pop('racks')
    return counts


def counts_by_parent(conn, level: str, warehouse_id: int) -> Dict[int, Dict[str, int]]:
    """Counts for every zone / aisle / rack of a warehouse, in one query each."""
    if level == 'zone':
        sql = """
            SELECT z.zone_id AS parent_id,
                   count(DISTINCT a.aisle_id) AS aisles,
                   count(DISTINCT r.rack_id) AS racks,
                   count(DISTINCT s.shelf_id) AS shelves
            FROM zone z
            LEFT JOIN aisle a ON a.zone_id = z.zone_id
            LEFT JOIN rack r ON r.aisle_id = a.aisle_id
            LEFT JOIN shelf s ON s.rack_id = r.rack_id
            WHERE z.warehouse_id = :id GROUP BY z.zone_id
        """
        keys = ('aisles', 'racks', 'shelves')
    elif level == 'aisle':
        sql = """
            SELECT a.aisle_id AS parent_id,
                   count(DISTINCT r.rack_id) AS racks,
                   count(DISTINCT s.shelf_id) AS shelves
            FROM aisle a
            JOIN zone z ON z.zone_id = a.zone_id
            LEFT JOIN rack r ON r.aisle_id = a.aisle_id
            LEFT JOIN shelf s ON s.rack_id = r.rack_id
            WHERE z.warehouse_id = :id GROUP BY a.aisle_id
        """
        keys = ('racks', 'shelves')
    else:
        sql = """
            SELECT r.rack_id AS parent_id, count(s.shelf_id) AS shelves
            FROM rack r
            JOIN aisle a ON a.aisle_id = r.aisle_id
            JOIN zone z ON z.zone_id = a.zone_id
            LEFT JOIN shelf s ON s.rack_id = r.rack_id
            WHERE z.warehouse_id = :id GROUP BY r.rack_id
        """
        keys = ('shelves',)
    rows = conn.execute(text(sql), {'id': warehouse_id}).mappings().all()
    return {row['parent_id']: {key: row[key] for key in keys} for row in rows}


def warehouse_tree_rows(conn, warehouse_id: int, level: str):
    """Every zone / aisle / rack / shelf of a warehouse, flat, for the layout read."""
    if level == 'zone':
        sql = 'SELECT * FROM zone WHERE warehouse_id = :id ORDER BY code'
    elif level == 'aisle':
        sql = ('SELECT a.* FROM aisle a JOIN zone z ON z.zone_id = a.zone_id '
               'WHERE z.warehouse_id = :id ORDER BY a.label')
    elif level == 'rack':
        sql = ('SELECT r.* FROM rack r JOIN aisle a ON a.aisle_id = r.aisle_id '
               'JOIN zone z ON z.zone_id = a.zone_id WHERE z.warehouse_id = :id ORDER BY r.label')
    else:
        sql = ('SELECT s.* FROM shelf s JOIN rack r ON r.rack_id = s.rack_id '
               'JOIN aisle a ON a.aisle_id = r.aisle_id JOIN zone z ON z.zone_id = a.zone_id '
               'WHERE z.warehouse_id = :id ORDER BY s.level')
    return conn.execute(text(sql), {'id': warehouse_id}).mappings().all()


# --- inserts --------------------------------------------------------------

def insert_zone(conn, warehouse_id: int, code: str, name: str, description: Optional[str]):
    return conn.execute(
        text('INSERT INTO zone (warehouse_id, code, name, description) '
             'VALUES (:warehouse_id, :code, :name, :description) RETURNING *'),
        {'warehouse_id': warehouse_id, 'code': code, 'name': name, 'description': description},
    ).mappings().first()


def _bulk_insert(conn, sql_head: str, columns: Sequence[str], rows: Sequence[Dict[str, Any]],
                 returning: str):
    """Multi-row INSERT ... RETURNING, batched, on the caller's transaction."""
    results = []
    for start in range(0, len(rows), INSERT_BATCH):
        batch = rows[start:start + INSERT_BATCH]
        values, params = [], {}
        for index, row in enumerate(batch):
            placeholders = []
            for column in columns:
                key = f'{column}_{index}'
                params[key] = row[column]
                placeholders.append(f':{key}')
            values.append('(' + ', '.join(placeholders) + ')')
        result = conn.execute(
            text(f'{sql_head} VALUES {", ".join(values)} RETURNING {returning}'), params)
        results.extend(result.mappings().all())
    return results


def insert_aisles(conn, rows: Sequence[Dict[str, Any]]):
    return _bulk_insert(conn, 'INSERT INTO aisle (zone_id, label, width, width_unit)',
                        ('zone_id', 'label', 'width', 'width_unit'), rows, '*')


def insert_racks(conn, rows: Sequence[Dict[str, Any]]):
    return _bulk_insert(conn, 'INSERT INTO rack (aisle_id, label, max_height, height_unit)',
                        ('aisle_id', 'label', 'max_height', 'height_unit'), rows, '*')


def insert_shelves(conn, rows: Sequence[Dict[str, Any]]):
    return _bulk_insert(conn, 'INSERT INTO shelf (rack_id, level, max_weight, max_volume)',
                        ('rack_id', 'level', 'max_weight', 'max_volume'), rows, '*')


def existing_labels(conn, level: str, parent_id: int) -> List[str]:
    column = {'zone': 'code', 'aisle': 'label', 'rack': 'label', 'shelf': 'level'}[level]
    parent_fk = {'zone': 'warehouse_id', 'aisle': 'zone_id', 'rack': 'aisle_id', 'shelf': 'rack_id'}[level]
    table = _TABLE[level][0]
    rows = conn.execute(text(f'SELECT {column} FROM {table} WHERE {parent_fk} = :parent_id'),
                        {'parent_id': parent_id}).all()
    return [row[0] for row in rows]


def patch_shelves_bulk(conn, ids: Sequence[int], columns: Dict[str, Any]):
    assignments = ', '.join(f'{column} = :{column}' for column in columns)
    params = dict(columns)
    params['ids'] = list(ids)
    return conn.execute(
        text(f'UPDATE shelf SET {assignments}, updated_at = CURRENT_TIMESTAMP '
             'WHERE shelf_id = ANY(:ids) RETURNING *'),
        params,
    ).mappings().all()


def missing_ids(conn, table: str, pk: str, ids: Iterable[int]) -> List[int]:
    ids = list(ids)
    found = {row[0] for row in conn.execute(
        text(f'SELECT {pk} FROM {table} WHERE {pk} = ANY(:ids)'), {'ids': ids}).all()}
    return [entity_id for entity_id in ids if entity_id not in found]
