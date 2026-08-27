"""/zones - and the aisles beneath them, one at a time or by range."""
from flask import Blueprint, jsonify

from application import logger
from database import db_engine
from topology.building import (aisle_rows, check_collisions, check_shelf_budget, expand_aisles,
                               expand_levels, expand_racks, rack_rows, shelf_rows)
from topology.deletion import perform_delete
from topology.errors import bool_arg, parse_body
from topology.pagination import envelope, page_params
from topology.repository import (aisle_out, insert_aisles, insert_racks, insert_shelves,
                                 list_children, patch_row, require_row, zone_out)
from topology.schemas import AisleCreate, AisleGenerate, ZonePatch

zones_bp = Blueprint('zones_bp', __name__)


@zones_bp.route('/zones/<int:zone_id>', methods=['GET'])
def get_zone(zone_id):
    with db_engine.connect() as conn:
        row = require_row(conn, 'zone', zone_id)
    return jsonify(zone_out(row))


@zones_bp.route('/zones/<int:zone_id>', methods=['PATCH'])
def update_zone(zone_id):
    body = parse_body(ZonePatch)
    with db_engine.begin() as conn:
        row = patch_row(conn, 'zone', zone_id, body.changes())
        payload = zone_out(row)
    logger.info(f'Patched zone {zone_id}: {sorted(body.changes())}')
    return jsonify(payload)


@zones_bp.route('/zones/<int:zone_id>', methods=['DELETE'])
def delete_zone(zone_id):
    cascade, dry_run = bool_arg('cascade'), bool_arg('dry_run')
    with db_engine.begin() as conn:
        row = require_row(conn, 'zone', zone_id)
        result = perform_delete(conn, 'zone', zone_id, row['code'], cascade, dry_run)
    if result is not None:
        return jsonify(result), 200
    logger.info(f'Deleted zone {zone_id}')
    return '', 204


@zones_bp.route('/zones/<int:zone_id>/aisles', methods=['GET'], strict_slashes=False)
def get_zone_aisles(zone_id):
    page, limit, offset = page_params()
    with db_engine.connect() as conn:
        require_row(conn, 'zone', zone_id)
        rows, total = list_children(conn, 'aisle', zone_id, limit, offset)
    return jsonify(envelope([aisle_out(row) for row in rows], page, limit, total))


@zones_bp.route('/zones/<int:zone_id>/aisles', methods=['POST'], strict_slashes=False)
def create_aisle(zone_id):
    body = parse_body(AisleCreate)
    with db_engine.begin() as conn:
        require_row(conn, 'zone', zone_id)
        rows = insert_aisles(conn, aisle_rows(zone_id, [body.label], body.width))
        payload = aisle_out(rows[0])
    logger.info(f"Created aisle {payload['id']} ({body.label}) in zone {zone_id}")
    return jsonify(payload), 201


@zones_bp.route('/zones/<int:zone_id>/aisles:generate', methods=['POST'])
def generate_aisles(zone_id):
    """Aisles by range, optionally with the racks and shelves under them."""
    body = parse_body(AisleGenerate)
    dry_run = bool_arg('dry_run')

    aisle_labels = expand_aisles(body)
    rack_labels = expand_racks(body.racks) if body.racks else []
    levels = expand_levels(body.racks.shelves) if body.racks and body.racks.shelves else []
    created = {'aisles': len(aisle_labels),
               'racks': len(aisle_labels) * len(rack_labels),
               'shelves': len(aisle_labels) * len(rack_labels) * len(levels)}
    check_shelf_budget(created['shelves'])

    with db_engine.begin() as conn:
        require_row(conn, 'zone', zone_id)
        check_collisions(conn, 'aisle', zone_id, aisle_labels, 'Aisle labels')
        if dry_run:
            return jsonify({'would_create': created}), 200
        aisles = insert_aisles(conn, aisle_rows(zone_id, aisle_labels, body.width))
        if rack_labels:
            racks = insert_racks(conn, rack_rows([row['aisle_id'] for row in aisles],
                                                 rack_labels, body.racks.max_height))
            if levels:
                insert_shelves(conn, shelf_rows([row['rack_id'] for row in racks], levels,
                                                body.racks.shelves.max_weight,
                                                body.racks.shelves.max_volume))
        payload = [aisle_out(row) for row in aisles]
    logger.info(f'Generated in zone {zone_id}: {created}')
    return jsonify({'created': created, 'aisles': payload}), 201
