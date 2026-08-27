"""/warehouses - the root of the topology, plus the declarative layout endpoints.

Note the plural: the pre-existing `/warehouse/{id}` (singular) returns the
*employees* of a warehouse and is a different namespace entirely.
"""
from flask import Blueprint, jsonify, request

from application import logger
from database import db_engine
from topology.building import (aisle_rows, check_collisions, check_shelf_budget, expand_aisles,
                               expand_levels, expand_racks, rack_rows, shelf_rows)
from topology.errors import ApiError, bool_arg, parse_body
from topology.labels import MAX_ZONES_PER_LAYOUT
from topology.pagination import envelope, page_params
from topology.repository import (aisle_out, counts_by_parent, counts_under, get_warehouse,
                                 insert_aisles, insert_location, insert_racks, insert_shelves,
                                 insert_warehouse, insert_zone, list_children, list_warehouses,
                                 location_exists, patch_row, rack_out, shelf_out, warehouse_out,
                                 warehouse_tree_rows, zone_out)
from topology.schemas import CANONICAL_NAMING, LayoutCreate, WarehouseCreate, WarehousePatch, ZoneCreate

warehouses_bp = Blueprint('warehouses_bp', __name__)

DEPTHS = ('zone', 'aisle', 'rack', 'shelf')


def _require_warehouse(conn, warehouse_id: int):
    row = get_warehouse(conn, warehouse_id)
    if row is None:
        raise ApiError('not_found', f'Warehouse {warehouse_id} not found.', 404)
    return row


@warehouses_bp.route('/warehouses', methods=['GET'], strict_slashes=False)
def get_warehouses():
    page, limit, offset = page_params()
    with db_engine.connect() as conn:
        rows, total = list_warehouses(conn, request.args.get('city'), request.args.get('country'),
                                      request.args.get('q'), limit, offset)
    logger.info(f'Fetched {len(rows)} of {total} warehouses')
    return jsonify(envelope([warehouse_out(row) for row in rows], page, limit, total))


@warehouses_bp.route('/warehouses/<int:warehouse_id>', methods=['GET'])
def get_warehouse_details(warehouse_id):
    with db_engine.connect() as conn:
        row = _require_warehouse(conn, warehouse_id)
    return jsonify(warehouse_out(row))


@warehouses_bp.route('/warehouses', methods=['POST'], strict_slashes=False)
def create_warehouse():
    body = parse_body(WarehouseCreate)
    with db_engine.begin() as conn:
        if body.location is not None:
            location_id = insert_location(conn, body.location.model_dump())
        else:
            location_id = body.location_id
            if not location_exists(conn, location_id):
                raise ApiError('not_found', f'Location {location_id} not found.', 404)
        warehouse_id = insert_warehouse(conn, location_id, body.name, body.description)
        row = get_warehouse(conn, warehouse_id)
        payload = warehouse_out(row)
    logger.info(f'Created warehouse {warehouse_id}')
    return jsonify(payload), 201


@warehouses_bp.route('/warehouses/<int:warehouse_id>', methods=['PATCH'])
def update_warehouse(warehouse_id):
    body = parse_body(WarehousePatch)
    columns = body.changes()
    with db_engine.begin() as conn:
        if 'location_id' in columns and not location_exists(conn, columns['location_id']):
            raise ApiError('not_found', f"Location {columns['location_id']} not found.", 404)
        patch_row(conn, 'warehouse', warehouse_id, columns)
        payload = warehouse_out(get_warehouse(conn, warehouse_id))
    logger.info(f'Patched warehouse {warehouse_id}: {sorted(columns)}')
    return jsonify(payload)


# --- zones under a warehouse ---------------------------------------------

@warehouses_bp.route('/warehouses/<int:warehouse_id>/zones', methods=['GET'], strict_slashes=False)
def get_warehouse_zones(warehouse_id):
    page, limit, offset = page_params()
    with db_engine.connect() as conn:
        _require_warehouse(conn, warehouse_id)
        rows, total = list_children(conn, 'zone', warehouse_id, limit, offset)
    return jsonify(envelope([zone_out(row) for row in rows], page, limit, total))


@warehouses_bp.route('/warehouses/<int:warehouse_id>/zones', methods=['POST'], strict_slashes=False)
def create_zone(warehouse_id):
    body = parse_body(ZoneCreate)
    with db_engine.begin() as conn:
        _require_warehouse(conn, warehouse_id)
        row = insert_zone(conn, warehouse_id, body.code, body.name, body.description)
        payload = zone_out(row)
    logger.info(f"Created zone {payload['id']} ({body.code}) in warehouse {warehouse_id}")
    return jsonify(payload), 201


# --- layout ---------------------------------------------------------------

@warehouses_bp.route('/warehouses/<int:warehouse_id>/layout', methods=['GET'])
def get_layout(warehouse_id):
    depth = request.args.get('depth', 'zone')
    if depth not in DEPTHS:
        raise ApiError('invalid_query',
                       f"Query parameter 'depth' must be one of {', '.join(DEPTHS)}.", 400)
    wanted = DEPTHS[:DEPTHS.index(depth) + 1]

    with db_engine.connect() as conn:
        warehouse = _require_warehouse(conn, warehouse_id)
        totals = counts_under(conn, 'warehouse', warehouse_id)
        zones = warehouse_tree_rows(conn, warehouse_id, 'zone')
        zone_counts = counts_by_parent(conn, 'zone', warehouse_id)
        aisles = warehouse_tree_rows(conn, warehouse_id, 'aisle') if 'aisle' in wanted else []
        aisle_counts = counts_by_parent(conn, 'aisle', warehouse_id) if 'aisle' in wanted else {}
        racks = warehouse_tree_rows(conn, warehouse_id, 'rack') if 'rack' in wanted else []
        rack_counts = counts_by_parent(conn, 'rack', warehouse_id) if 'rack' in wanted else {}
        shelves = warehouse_tree_rows(conn, warehouse_id, 'shelf') if 'shelf' in wanted else []

    shelves_by_rack = {}
    for row in shelves:
        shelves_by_rack.setdefault(row['rack_id'], []).append(row)
    racks_by_aisle = {}
    for row in racks:
        racks_by_aisle.setdefault(row['aisle_id'], []).append(row)
    aisles_by_zone = {}
    for row in aisles:
        aisles_by_zone.setdefault(row['zone_id'], []).append(row)

    tree = []
    for zone in zones:
        zone_node = zone_out(zone)
        zone_node['counts'] = zone_counts.get(zone['zone_id'], {'aisles': 0, 'racks': 0, 'shelves': 0})
        if 'aisle' in wanted:
            zone_node['aisles'] = []
            for aisle in aisles_by_zone.get(zone['zone_id'], []):
                aisle_node = aisle_out(aisle)
                aisle_node['counts'] = aisle_counts.get(aisle['aisle_id'], {'racks': 0, 'shelves': 0})
                if 'rack' in wanted:
                    aisle_node['racks'] = []
                    for rack in racks_by_aisle.get(aisle['aisle_id'], []):
                        rack_node = rack_out(rack)
                        rack_node['counts'] = rack_counts.get(rack['rack_id'], {'shelves': 0})
                        if 'shelf' in wanted:
                            rack_node['shelves'] = [
                                dict(shelf_out(shelf),
                                     code=f"{zone['code']}-{aisle['label']}-{rack['label']}-L{shelf['level']}")
                                for shelf in shelves_by_rack.get(rack['rack_id'], [])
                            ]
                        aisle_node['racks'].append(rack_node)
                zone_node['aisles'].append(aisle_node)
        tree.append(zone_node)

    return jsonify({'warehouse': warehouse_out(warehouse), 'depth': depth,
                    'counts': totals, 'zones': tree})


@warehouses_bp.route('/warehouses/<int:warehouse_id>/layout', methods=['POST'])
def create_layout(warehouse_id):
    body = parse_body(LayoutCreate)
    dry_run = bool_arg('dry_run')

    if len(body.zones) > MAX_ZONES_PER_LAYOUT:
        raise ApiError('limit_exceeded',
                       f'{len(body.zones)} zones in one call, the maximum is {MAX_ZONES_PER_LAYOUT}.',
                       400, limit=MAX_ZONES_PER_LAYOUT, requested=len(body.zones))
    codes = [zone.code for zone in body.zones]
    repeated = sorted({code for code in codes if codes.count(code) > 1})
    if repeated:
        raise ApiError('invalid_body', f"Zone codes repeat in the body: {', '.join(repeated)}.", 400)

    # Expand everything before touching the database, so a bad range costs nothing.
    plans = []
    for zone in body.zones:
        aisle_labels = expand_aisles(zone.aisles) if zone.aisles else []
        rack_labels = expand_racks(zone.racks) if zone.racks else []
        levels = expand_levels(zone.shelves) if zone.shelves else []
        plans.append((zone, aisle_labels, rack_labels, levels))

    created = {'zones': len(plans), 'aisles': 0, 'racks': 0, 'shelves': 0}
    for _zone, aisle_labels, rack_labels, levels in plans:
        racks = len(aisle_labels) * len(rack_labels)
        created['aisles'] += len(aisle_labels)
        created['racks'] += racks
        created['shelves'] += racks * len(levels)
    check_shelf_budget(created['shelves'])

    with db_engine.begin() as conn:
        _require_warehouse(conn, warehouse_id)
        check_collisions(conn, 'zone', warehouse_id, codes, 'Zone codes')
        if dry_run:
            logger.info(f'Dry run layout for warehouse {warehouse_id}: {created}')
            return jsonify({'would_create': created, 'naming': CANONICAL_NAMING}), 200

        zone_payloads = []
        for zone, aisle_labels, rack_labels, levels in plans:
            zone_row = insert_zone(conn, warehouse_id, zone.code, zone.name, zone.description)
            zone_payloads.append(zone_out(zone_row))
            if not aisle_labels:
                continue
            aisles = insert_aisles(conn, aisle_rows(zone_row['zone_id'], aisle_labels, zone.aisles.width))
            if not rack_labels:
                continue
            racks = insert_racks(conn, rack_rows([row['aisle_id'] for row in aisles],
                                                 rack_labels, zone.racks.max_height))
            if not levels:
                continue
            insert_shelves(conn, shelf_rows([row['rack_id'] for row in racks], levels,
                                            zone.shelves.max_weight, zone.shelves.max_volume))

    logger.info(f'Created layout in warehouse {warehouse_id}: {created}')
    return jsonify({'created': created, 'naming': CANONICAL_NAMING, 'zones': zone_payloads}), 201
