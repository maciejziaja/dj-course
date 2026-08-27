"""The one HTTP-aware module of the topology package.

Everything else in `topology/` deals in plain Python values; this module owns the
error envelope, the Flask error handlers and the small request-parsing helpers
that turn a bad request into that same envelope.

Envelope: {"error": <code>, "message": <human text>, ...extra}
"""
from typing import Any, Dict, Optional, Type

from flask import jsonify, request
from pydantic import BaseModel, ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException, MethodNotAllowed, NotFound

from logger import logger


class ApiError(Exception):
    """An error the caller is meant to read: a code, a message and some context."""

    def __init__(self, code: str, message: str, http_status: int = 400, **extra: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.extra = extra

    def to_dict(self) -> Dict[str, Any]:
        payload = {'error': self.code, 'message': self.message}
        payload.update(self.extra)
        return payload


def not_found(entity: str, entity_id: Any) -> ApiError:
    return ApiError('not_found', f"{entity.capitalize()} {entity_id} not found.", 404)


# Unique indexes added in create-wms-schema.sql, translated into which key collided.
UNIQUE_CONSTRAINTS = {
    'uq_zone_code': ('duplicate_code', 'A zone with this code already exists in this warehouse.'),
    'uq_aisle_label': ('duplicate_label', 'An aisle with this label already exists in this zone.'),
    'uq_rack_label': ('duplicate_label', 'A rack with this label already exists in this aisle.'),
    'uq_shelf_level': ('duplicate_level', 'A shelf with this level already exists on this rack.'),
}


def _constraint_name(exc: IntegrityError) -> Optional[str]:
    diag = getattr(getattr(exc, 'orig', None), 'diag', None)
    return getattr(diag, 'constraint_name', None)


def integrity_error_to_api_error(exc: IntegrityError) -> ApiError:
    """Map a raw psycopg2 constraint violation onto the 409/400 envelope."""
    constraint = _constraint_name(exc)
    if constraint in UNIQUE_CONSTRAINTS:
        code, message = UNIQUE_CONSTRAINTS[constraint]
        return ApiError(code, message, 409, constraint=constraint)
    pgcode = getattr(getattr(exc, 'orig', None), 'pgcode', None)
    if pgcode == '23505':  # unique_violation on an index we do not know by name
        return ApiError('conflict', 'A row with these values already exists.', 409,
                        constraint=constraint)
    if pgcode == '23503':  # foreign_key_violation
        return ApiError('invalid_reference', 'A referenced row does not exist.', 400,
                        constraint=constraint)
    if pgcode == '23514':  # check_violation
        return ApiError('invalid_value', 'A value violates a database constraint.', 400,
                        constraint=constraint)
    return ApiError('conflict', 'The request conflicts with the current state of the data.', 409,
                    constraint=constraint)


def register_topology_error_handlers(app) -> None:
    @app.errorhandler(ApiError)
    def _handle_api_error(exc: ApiError):
        return jsonify(exc.to_dict()), exc.http_status

    @app.errorhandler(IntegrityError)
    def _handle_integrity_error(exc: IntegrityError):
        api_error = integrity_error_to_api_error(exc)
        return jsonify(api_error.to_dict()), api_error.http_status

    # Werkzeug answers an unrouted URL, a wrong method or an unhandled exception
    # with an HTML page. For a JSON API that is a content-type the contract never
    # promised, so the three are given the same envelope as everything else.
    @app.errorhandler(NotFound)
    def _handle_not_found(exc: NotFound):
        return jsonify(ApiError('not_found', 'No endpoint matches this URL.', 404).to_dict()), 404

    @app.errorhandler(MethodNotAllowed)
    def _handle_method_not_allowed(exc: MethodNotAllowed):
        allowed = sorted(exc.valid_methods or [])
        error = ApiError('method_not_allowed',
                         f'{request.method} is not allowed on this URL.', 405,
                         allowed=allowed)
        response = jsonify(error.to_dict())
        if allowed:
            response.headers['Allow'] = ', '.join(allowed)
        return response, 405

    @app.errorhandler(Exception)
    def _handle_unexpected(exc: Exception):
        if isinstance(exc, HTTPException):
            return exc
        logger.exception(f'Unhandled error on {request.method} {request.path}')
        # Registering a catch-all handler otherwise overrides Flask's own
        # propagation, and a debugger or a test run would lose the traceback it
        # was about to be handed.
        if app.config.get('PROPAGATE_EXCEPTIONS') or app.testing or app.debug:
            raise exc
        return jsonify(ApiError('internal_error',
                                'The request could not be completed.', 500).to_dict()), 500


def _format_validation_error(exc: ValidationError):
    return [
        {'field': '.'.join(str(part) for part in err['loc']) or '(body)',
         'message': err['msg']}
        for err in exc.errors()
    ]


def parse_body(model_cls: Type[BaseModel]) -> BaseModel:
    """Validate the JSON body against a pydantic model, or raise a 400."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError('invalid_body', 'A JSON object body is required.', 400)
    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        raise ApiError('invalid_body', 'Request body failed validation.', 400,
                       details=_format_validation_error(exc))


def bool_arg(name: str, default: bool = False) -> bool:
    raw = request.args.get(name)
    if raw is None:
        return default
    lowered = raw.strip().lower()
    if lowered in ('true', '1', 'yes'):
        return True
    if lowered in ('false', '0', 'no'):
        return False
    raise ApiError('invalid_query', f"Query parameter '{name}' must be true or false.", 400)


def int_arg(name: str, default: Optional[int] = None) -> Optional[int]:
    raw = request.args.get(name)
    if raw is None or raw == '':
        return default
    try:
        return int(raw)
    except ValueError:
        raise ApiError('invalid_query', f"Query parameter '{name}' must be an integer.", 400)
