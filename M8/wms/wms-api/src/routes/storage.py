import json
from flask import Blueprint, jsonify, request
from application import logger
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from database import db_engine

storage_bp = Blueprint('storage_bp', __name__)

@storage_bp.route('/reservations/active', methods=['GET'])
def get_active_reservations():
    query = text('''
        SELECT *
        FROM storage_reservation
        WHERE status = 'active'
        ORDER BY reserved_from ASC
        LIMIT 50;
    ''')
    with db_engine.connect() as conn:
        result = conn.execute(query)
        reservations = [dict(row) for row in result.mappings()]
    logger.info(f"Fetched {len(reservations)} active reservations")
    return jsonify(reservations)

@storage_bp.route('/cargo', methods=['GET'])
def get_cargo_by_description():
    description = request.args.get('description')
    if not description:
        return jsonify([])
    query = text('''
        SELECT *
        FROM storage_record
        WHERE cargo_description ILIKE :pattern;
    ''')
    pattern = f'%{description}%'
    with db_engine.connect() as conn:
        result = conn.execute(query, {'pattern': pattern})
        rows = [dict(row) for row in result.mappings()]
    logger.info(f"Fetched {len(rows)} storage records for description '{description}'")
    return jsonify(rows)

@storage_bp.route('/<int:record_id>/events', methods=['GET'])
def get_storage_event_history(record_id):
    severity = request.args.get('severity')
    if severity:
        query = text('''
            SELECT event_time, details
            FROM storage_event_history
            WHERE storage_record_id = :record_id
              AND details->>'severity' = :severity
            ORDER BY event_time;
        ''')
        params = {'record_id': record_id, 'severity': severity}
    else:
        query = text('''
            SELECT
                event_id,
                storage_record_id,
                event_type_id,
                event_time,
                employee_id,
                details
            FROM
                storage_event_history
            WHERE
                storage_record_id = :record_id
            ORDER BY
                event_time;
        ''')
        params = {'record_id': record_id}
    with db_engine.connect() as conn:
        result = conn.execute(query, params)
        events = [dict(row) for row in result.mappings()]
    logger.info(
        "Fetched %s storage event(s) for storage_record_id=%s%s",
        len(events), record_id, f" (severity={severity})" if severity else ""
    )
    return jsonify(events)

# =========================================================================
# CARGO MODULE (JSONB) -- Task 5
# Flexible technical "passport" of cargo in a JSONB column + change audit.
# Mounted under /storage (see app.register_blueprint(storage_bp, url_prefix='/storage')).
# =========================================================================

def _exec_cargo_mutation(query, params, actor_id=None):
    """Run a cargo mutation in one transaction, setting the audit GUC
    (app.current_user_id) so the trigger records WHO changed metadata.
    The .http contract carries no user, so actor_id defaults to None -> changed_by
    is NULL (the column is ready for future auth). db_engine.begin() commits on
    success, rolls back on exception."""
    with db_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.current_user_id', :uid, true)"),
            {'uid': '' if actor_id is None else str(actor_id)},
        )
        return conn.execute(query, params).mappings().first()

# 3.1 POST /storage/cargo -- register cargo
@storage_bp.route('/cargo', methods=['POST'])
def register_cargo():
    body = request.get_json(silent=True) or {}
    missing = [f for f in ('category_id', 'name', 'weight') if body.get(f) is None]
    if missing:
        return jsonify({'error': f"Missing required field(s): {', '.join(missing)}"}), 400
    params = {
        'category_id': body['category_id'],
        'name': body['name'],
        'weight': body['weight'],
        'metadata': json.dumps(body.get('metadata') or {}),  # CAST to jsonb (DEFAULT '{}' if absent)
    }
    query = text('''
        INSERT INTO cargo (category_id, name, weight, metadata)
        VALUES (:category_id, :name, :weight, CAST(:metadata AS jsonb))
        RETURNING cargo_id, category_id, name, weight, metadata, created_at;
    ''')
    try:
        row = _exec_cargo_mutation(query, params)
    except IntegrityError:
        # FK guards category existence -> unknown category_id is a client error, not a 500.
        return jsonify({'error': f"Unknown category_id {body['category_id']}"}), 400
    logger.info(f"Registered cargo {row['cargo_id']} (category {row['category_id']})")
    return jsonify(dict(row)), 201

# 3.4 GET /storage/cargo/search?fragile=true -- search by metadata
# (the <int> converter below never matches 'search', so route order is irrelevant)
@storage_bp.route('/cargo/search', methods=['GET'])
def search_cargo():
    fragile = request.args.get('fragile')
    if fragile is None:
        return jsonify([])
    # Recommended variant: fragile=true is served by the partial index idx_cargo_fragile.
    query = text('''
        SELECT cargo_id, name, weight, metadata
        FROM cargo
        WHERE (metadata->>'fragile')::boolean = :fragile
        ORDER BY cargo_id;
    ''')
    params = {'fragile': fragile.strip().lower() == 'true'}
    with db_engine.connect() as conn:
        rows = [dict(row) for row in conn.execute(query, params).mappings()]
    logger.info(f"Cargo search fragile={params['fragile']} -> {len(rows)} row(s)")
    return jsonify(rows)

# 3.5 GET /storage/cargo/stats?firmware=1.2.1 -- weight stats by metadata key
@storage_bp.route('/cargo/stats', methods=['GET'])
def cargo_stats():
    firmware = request.args.get('firmware')
    if firmware is None:
        return jsonify({'error': "Query param 'firmware' is required"}), 400
    # GIN idx_cargo_metadata_gin via containment (@>); jsonb_build_object builds the
    # value safely (no manual JSON string concatenation).
    query = text('''
        SELECT COALESCE(SUM(weight), 0) AS total_weight, COUNT(*) AS count
        FROM cargo
        WHERE metadata @> jsonb_build_object('firmware_version', :firmware);
    ''')
    with db_engine.connect() as conn:
        row = conn.execute(query, {'firmware': firmware}).mappings().first()
    logger.info(f"Cargo stats firmware_version={firmware} -> count={row['count']}")
    return jsonify(dict(row))

# 3.2 GET /storage/cargo/<id> -- details + category name
@storage_bp.route('/cargo/<int:cargo_id>', methods=['GET'])
def get_cargo_details(cargo_id):
    query = text('''
        SELECT c.cargo_id, c.name, c.weight, c.metadata,
               c.category_id, cat.name AS category_name,
               c.created_at, c.updated_at
        FROM cargo c
        JOIN cargo_category cat ON cat.category_id = c.category_id
        WHERE c.cargo_id = :cargo_id;
    ''')
    with db_engine.connect() as conn:
        row = conn.execute(query, {'cargo_id': cargo_id}).mappings().first()
    if row is None:
        return jsonify({'error': f'Cargo {cargo_id} not found'}), 404
    return jsonify(dict(row))

# 3.3a PATCH /storage/cargo/<id>/metadata -- partial update (shallow merge)
@storage_bp.route('/cargo/<int:cargo_id>/metadata', methods=['PATCH'])
def patch_cargo_metadata(cargo_id):
    patch = request.get_json(silent=True)
    if not isinstance(patch, dict):
        return jsonify({'error': 'Request body must be a JSON object'}), 400
    # '||' = shallow merge: adds new keys, overwrites existing, keeps the rest.
    query = text('''
        UPDATE cargo
        SET metadata = metadata || CAST(:patch AS jsonb),
            updated_at = CURRENT_TIMESTAMP
        WHERE cargo_id = :cargo_id
        RETURNING cargo_id, metadata, updated_at;
    ''')
    row = _exec_cargo_mutation(query, {'cargo_id': cargo_id, 'patch': json.dumps(patch)})
    if row is None:
        return jsonify({'error': f'Cargo {cargo_id} not found'}), 404
    logger.info(f"Merged metadata patch into cargo {cargo_id}")
    return jsonify(dict(row))

# 3.3b DELETE /storage/cargo/<id>/metadata/<key> -- remove a top-level key
@storage_bp.route('/cargo/<int:cargo_id>/metadata/<key>', methods=['DELETE'])
def delete_cargo_metadata_key(cargo_id, key):
    # '-' removes a top-level key; removing a missing key is a no-op (returns current metadata).
    query = text('''
        UPDATE cargo
        SET metadata = metadata - :key,
            updated_at = CURRENT_TIMESTAMP
        WHERE cargo_id = :cargo_id
        RETURNING cargo_id, metadata, updated_at;
    ''')
    row = _exec_cargo_mutation(query, {'cargo_id': cargo_id, 'key': key})
    if row is None:
        return jsonify({'error': f'Cargo {cargo_id} not found'}), 404
    logger.info(f"Removed metadata key '{key}' from cargo {cargo_id}")
    return jsonify(dict(row))

# 3.6 GET /storage/cargo/<id>/history -- metadata change audit log
@storage_bp.route('/cargo/<int:cargo_id>/history', methods=['GET'])
def get_cargo_history(cargo_id):
    # idx_cargo_audit_cargo (cargo_id, changed_at DESC) covers both filter and sort.
    query = text('''
        SELECT changed_at, changed_by, old_metadata, new_metadata
        FROM cargo_metadata_audit
        WHERE cargo_id = :cargo_id
        ORDER BY changed_at DESC;
    ''')
    with db_engine.connect() as conn:
        rows = [dict(row) for row in conn.execute(query, {'cargo_id': cargo_id}).mappings()]
    logger.info(f"Fetched {len(rows)} audit entr(ies) for cargo {cargo_id}")
    return jsonify(rows)
