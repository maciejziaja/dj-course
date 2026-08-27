"""GET /locations - the picker behind POST /warehouses.

A location has no children and nothing to cascade, so v1 deliberately stops at
reading them and creating one inline with a warehouse (D3 of the plan).
"""
from flask import Blueprint, jsonify, request

from logger import logger
from database import db_engine
from topology.pagination import envelope, page_params
from topology.repository import list_locations, location_out

locations_bp = Blueprint('locations_bp', __name__)


@locations_bp.route('/locations', methods=['GET'], strict_slashes=False)
def get_locations():
    page, limit, offset = page_params()
    with db_engine.connect() as conn:
        rows, total = list_locations(conn, request.args.get('city'), request.args.get('country'),
                                     request.args.get('q'), limit, offset)
    logger.info(f'Fetched {len(rows)} of {total} locations')
    return jsonify(envelope([location_out(row) for row in rows], page, limit, total))
