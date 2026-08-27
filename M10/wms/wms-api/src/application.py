from flask import Flask, request
from flask_cors import CORS
import os
import re
from env import assert_env_var
from logger import logger

# register blueprints
from routes.health import health_bp
from routes.warehouse import warehouse_bp
from routes.payments import payments_bp
from routes.storage import storage_bp
from routes.employees import employees_bp
from routes.contractors import contractors_bp
# topology (warehouse -> zone -> aisle -> rack -> shelf); registered without a
# url_prefix because Flask cannot build '/shelves:bulk' from a prefix
from routes.locations import locations_bp
from routes.warehouses import warehouses_bp
from routes.zones import zones_bp
from routes.aisles import aisles_bp
from routes.racks import racks_bp
from routes.shelves import shelves_bp
from topology.errors import register_topology_error_handlers
from openapi_guard import init_openapi_guard

assert_env_var('SERVICE_NAME')
SERVICE_NAME = os.environ.get('SERVICE_NAME')

app = Flask(SERVICE_NAME)

_cors_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:4200')
CORS(app, origins=[o.strip() for o in _cors_origins.split(',') if o.strip()])

@app.before_request
def log_request():
    # X-Request-Id is declared as an optional uuid header in openapi.yaml. This
    # hook is registered before the guard, so the line is logged either way - a
    # malformed id is then rejected with 400 invalid_header.
    correlation_id = request.headers.get('X-Request-Id')
    suffix = f" [request_id={correlation_id}]" if correlation_id else ''
    logger.info(f"Request: {request.method} {request.url}{suffix}")

app.register_blueprint(health_bp, url_prefix='/health')
app.register_blueprint(warehouse_bp, url_prefix='/warehouse')
app.register_blueprint(payments_bp, url_prefix='/payments')
app.register_blueprint(storage_bp, url_prefix='/storage')
app.register_blueprint(employees_bp, url_prefix='/employees')
app.register_blueprint(contractors_bp, url_prefix='/contractors')

app.register_blueprint(locations_bp)
app.register_blueprint(warehouses_bp)
app.register_blueprint(zones_bp)
app.register_blueprint(aisles_bp)
app.register_blueprint(racks_bp)
app.register_blueprint(shelves_bp)
register_topology_error_handlers(app)

# Registered last so it wraps every blueprint above: openapi.yaml is enforced on
# the way in and on the way out. See src/openapi_guard.py for the modes.
init_openapi_guard(app)
