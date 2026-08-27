"""/shelves - the flat catalogue, the leaf CRUD and the bulk patch.

`GET /shelves` is the one filter grammar in this API: everything else addresses
by id. `PATCH /shelves:bulk` therefore takes the ids you just saw, never a
filter - an accidental "update all" is not expressible.
"""
from flask import Blueprint, jsonify, request

from logger import logger
from database import db_engine
from topology.deletion import perform_delete
from topology.errors import ApiError, bool_arg, int_arg, parse_body
from topology.pagination import envelope, page_params
from topology.repository import (get_shelf_with_path, list_shelves, missing_ids, patch_row,
                                 patch_shelves_bulk, shelf_codes, shelf_out)
from topology.schemas import ShelfBulkPatch, ShelfPatch

shelves_bp = Blueprint('shelves_bp', __name__)


def _shelf_columns(body):
    changes = body.changes()
    columns = {}
    if 'level' in changes:
        columns['level'] = body.level
    if 'max_weight' in changes:
        columns['max_weight'] = body.max_weight.to_kg()
    if 'max_volume' in changes:
        columns['max_volume'] = body.max_volume.to_m3()
    return columns


def _decimal_arg(name):
    raw = request.args.get(name)
    if raw is None or raw == '':
        return None
    try:
        return float(raw)
    except ValueError:
        raise ApiError('invalid_query', f"Query parameter '{name}' must be a number.", 400)


@shelves_bp.route('/shelves', methods=['GET'], strict_slashes=False)
def get_shelves():
    page, limit, offset = page_params()
    filters = {
        'warehouse': int_arg('warehouse'),
        'zone': request.args.get('zone'),
        'aisle': request.args.get('aisle'),
        'rack': request.args.get('rack'),
        'level': request.args.get('level'),
        'code': request.args.get('code'),
        'max_weight_gte': _decimal_arg('max_weight_gte'),
        'max_volume_gte': _decimal_arg('max_volume_gte'),
    }
    with db_engine.connect() as conn:
        rows, total = list_shelves(conn, filters, limit, offset)
    logger.info(f'Fetched {len(rows)} of {total} shelves')
    return jsonify(envelope([shelf_out(row) for row in rows], page, limit, total))


@shelves_bp.route('/shelves:bulk', methods=['PATCH'])
def patch_shelves():
    """All or nothing: one unknown id and nothing at all is written."""
    body = parse_body(ShelfBulkPatch)
    columns = _shelf_columns(body.patch)
    ids = list(dict.fromkeys(body.ids))

    with db_engine.begin() as conn:
        missing = missing_ids(conn, 'shelf', 'shelf_id', ids)
        if missing:
            raise ApiError('not_found',
                           f'{len(missing)} of {len(ids)} shelves do not exist; nothing was written.',
                           404, missing=missing[:100])
        rows = patch_shelves_bulk(conn, ids, columns)
        codes = shelf_codes(conn, [row['shelf_id'] for row in rows])
        payload = [dict(shelf_out(row), code=codes.get(row['shelf_id'])) for row in rows]
    logger.info(f'Bulk-patched {len(payload)} shelves: {sorted(columns)}')
    return jsonify({'updated': len(payload), 'items': payload})


@shelves_bp.route('/shelves/<int:shelf_id>', methods=['GET'])
def get_shelf(shelf_id):
    with db_engine.connect() as conn:
        row = get_shelf_with_path(conn, shelf_id)
        if row is None:
            raise ApiError('not_found', f'Shelf {shelf_id} not found.', 404)
    return jsonify(shelf_out(row))


@shelves_bp.route('/shelves/<int:shelf_id>', methods=['PATCH'])
def update_shelf(shelf_id):
    body = parse_body(ShelfPatch)
    columns = _shelf_columns(body)
    with db_engine.begin() as conn:
        patch_row(conn, 'shelf', shelf_id, columns)
        payload = shelf_out(get_shelf_with_path(conn, shelf_id))
    logger.info(f'Patched shelf {shelf_id}: {sorted(columns)}')
    return jsonify(payload)


@shelves_bp.route('/shelves/<int:shelf_id>', methods=['DELETE'])
def delete_shelf(shelf_id):
    """A leaf: no cascade to consider, only the blocking check."""
    dry_run = bool_arg('dry_run')
    with db_engine.begin() as conn:
        row = get_shelf_with_path(conn, shelf_id)
        if row is None:
            raise ApiError('not_found', f'Shelf {shelf_id} not found.', 404)
        result = perform_delete(conn, 'shelf', shelf_id, row['code'], False, dry_run)
    if result is not None:
        return jsonify(result), 200
    logger.info(f'Deleted shelf {shelf_id}')
    return '', 204
