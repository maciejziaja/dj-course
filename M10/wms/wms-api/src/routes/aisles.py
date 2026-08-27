"""/aisles - and the racks beneath them."""
from flask import Blueprint, jsonify

from application import logger
from database import db_engine
from topology.building import (check_collisions, check_shelf_budget, expand_levels, expand_racks,
                               rack_rows, shelf_rows)
from topology.deletion import perform_delete
from topology.errors import bool_arg, parse_body
from topology.pagination import envelope, page_params
from topology.repository import (aisle_out, insert_racks, insert_shelves, list_children, patch_row,
                                 rack_out, require_row)
from topology.schemas import AislePatch, RackCreate, RackGenerate

aisles_bp = Blueprint('aisles_bp', __name__)


def _aisle_columns(body: AislePatch):
    changes = body.changes()
    columns = {}
    if 'label' in changes:
        columns['label'] = body.label
    if 'width' in changes:
        columns['width'] = body.width.value
        columns['width_unit'] = body.width.unit
    return columns


@aisles_bp.route('/aisles/<int:aisle_id>', methods=['GET'])
def get_aisle(aisle_id):
    with db_engine.connect() as conn:
        row = require_row(conn, 'aisle', aisle_id)
    return jsonify(aisle_out(row))


@aisles_bp.route('/aisles/<int:aisle_id>', methods=['PATCH'])
def update_aisle(aisle_id):
    body = parse_body(AislePatch)
    columns = _aisle_columns(body)
    with db_engine.begin() as conn:
        payload = aisle_out(patch_row(conn, 'aisle', aisle_id, columns))
    logger.info(f'Patched aisle {aisle_id}: {sorted(columns)}')
    return jsonify(payload)


@aisles_bp.route('/aisles/<int:aisle_id>', methods=['DELETE'])
def delete_aisle(aisle_id):
    cascade, dry_run = bool_arg('cascade'), bool_arg('dry_run')
    with db_engine.begin() as conn:
        row = require_row(conn, 'aisle', aisle_id)
        result = perform_delete(conn, 'aisle', aisle_id, row['label'], cascade, dry_run)
    if result is not None:
        return jsonify(result), 200
    logger.info(f'Deleted aisle {aisle_id}')
    return '', 204


@aisles_bp.route('/aisles/<int:aisle_id>/racks', methods=['GET'], strict_slashes=False)
def get_aisle_racks(aisle_id):
    page, limit, offset = page_params()
    with db_engine.connect() as conn:
        require_row(conn, 'aisle', aisle_id)
        rows, total = list_children(conn, 'rack', aisle_id, limit, offset)
    return jsonify(envelope([rack_out(row) for row in rows], page, limit, total))


@aisles_bp.route('/aisles/<int:aisle_id>/racks', methods=['POST'], strict_slashes=False)
def create_rack(aisle_id):
    body = parse_body(RackCreate)
    with db_engine.begin() as conn:
        require_row(conn, 'aisle', aisle_id)
        rows = insert_racks(conn, rack_rows([aisle_id], [body.label], body.max_height))
        payload = rack_out(rows[0])
    logger.info(f"Created rack {payload['id']} ({body.label}) in aisle {aisle_id}")
    return jsonify(payload), 201


@aisles_bp.route('/aisles/<int:aisle_id>/racks:generate', methods=['POST'])
def generate_racks(aisle_id):
    body = parse_body(RackGenerate)
    dry_run = bool_arg('dry_run')

    rack_labels = expand_racks(body)
    levels = expand_levels(body.shelves) if body.shelves else []
    created = {'racks': len(rack_labels), 'shelves': len(rack_labels) * len(levels)}
    check_shelf_budget(created['shelves'])

    with db_engine.begin() as conn:
        require_row(conn, 'aisle', aisle_id)
        check_collisions(conn, 'rack', aisle_id, rack_labels, 'Rack labels')
        if dry_run:
            return jsonify({'would_create': created}), 200
        racks = insert_racks(conn, rack_rows([aisle_id], rack_labels, body.max_height))
        if levels:
            insert_shelves(conn, shelf_rows([row['rack_id'] for row in racks], levels,
                                            body.shelves.max_weight, body.shelves.max_volume))
        payload = [rack_out(row) for row in racks]
    logger.info(f'Generated in aisle {aisle_id}: {created}')
    return jsonify({'created': created, 'racks': payload}), 201
