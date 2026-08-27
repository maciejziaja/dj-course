"""/racks - and the shelves beneath them."""
from flask import Blueprint, jsonify

from application import logger
from database import db_engine
from topology.building import check_collisions, check_shelf_budget, expand_levels, shelf_rows
from topology.deletion import perform_delete
from topology.errors import bool_arg, parse_body
from topology.pagination import envelope, page_params
from topology.repository import (insert_shelves, list_children, patch_row, rack_out, require_row,
                                 shelf_codes, shelf_out)
from topology.schemas import RackPatch, ShelfCreate, ShelfGenerate

racks_bp = Blueprint('racks_bp', __name__)


def _with_codes(conn, rows):
    """Shelf rows come back without the composed path; add it in one query."""
    codes = shelf_codes(conn, [row['shelf_id'] for row in rows])
    return [dict(shelf_out(row), code=codes.get(row['shelf_id'])) for row in rows]


def _rack_columns(body: RackPatch):
    changes = body.changes()
    columns = {}
    if 'label' in changes:
        columns['label'] = body.label
    if 'max_height' in changes:
        columns['max_height'] = body.max_height.value
        columns['height_unit'] = body.max_height.unit
    return columns


@racks_bp.route('/racks/<int:rack_id>', methods=['GET'])
def get_rack(rack_id):
    with db_engine.connect() as conn:
        row = require_row(conn, 'rack', rack_id)
    return jsonify(rack_out(row))


@racks_bp.route('/racks/<int:rack_id>', methods=['PATCH'])
def update_rack(rack_id):
    body = parse_body(RackPatch)
    columns = _rack_columns(body)
    with db_engine.begin() as conn:
        payload = rack_out(patch_row(conn, 'rack', rack_id, columns))
    logger.info(f'Patched rack {rack_id}: {sorted(columns)}')
    return jsonify(payload)


@racks_bp.route('/racks/<int:rack_id>', methods=['DELETE'])
def delete_rack(rack_id):
    cascade, dry_run = bool_arg('cascade'), bool_arg('dry_run')
    with db_engine.begin() as conn:
        row = require_row(conn, 'rack', rack_id)
        result = perform_delete(conn, 'rack', rack_id, row['label'], cascade, dry_run)
    if result is not None:
        return jsonify(result), 200
    logger.info(f'Deleted rack {rack_id}')
    return '', 204


@racks_bp.route('/racks/<int:rack_id>/shelves', methods=['GET'], strict_slashes=False)
def get_rack_shelves(rack_id):
    page, limit, offset = page_params()
    with db_engine.connect() as conn:
        require_row(conn, 'rack', rack_id)
        rows, total = list_children(conn, 'shelf', rack_id, limit, offset)
        payload = _with_codes(conn, rows)
    return jsonify(envelope(payload, page, limit, total))


@racks_bp.route('/racks/<int:rack_id>/shelves', methods=['POST'], strict_slashes=False)
def create_shelf(rack_id):
    body = parse_body(ShelfCreate)
    with db_engine.begin() as conn:
        require_row(conn, 'rack', rack_id)
        rows = insert_shelves(conn, shelf_rows([rack_id], [body.level],
                                               body.max_weight, body.max_volume))
        payload = _with_codes(conn, rows)[0]
    logger.info(f"Created shelf {payload['id']} (level {body.level}) on rack {rack_id}")
    return jsonify(payload), 201


@racks_bp.route('/racks/<int:rack_id>/shelves:generate', methods=['POST'])
def generate_shelves(rack_id):
    body = parse_body(ShelfGenerate)
    dry_run = bool_arg('dry_run')

    levels = expand_levels(body)
    created = {'shelves': len(levels)}
    check_shelf_budget(created['shelves'])

    with db_engine.begin() as conn:
        require_row(conn, 'rack', rack_id)
        check_collisions(conn, 'shelf', rack_id, levels, 'Shelf levels')
        if dry_run:
            return jsonify({'would_create': created}), 200
        rows = insert_shelves(conn, shelf_rows([rack_id], levels, body.max_weight, body.max_volume))
        payload = _with_codes(conn, rows)
    logger.info(f'Generated {created} on rack {rack_id}')
    return jsonify({'created': created, 'shelves': payload}), 201
