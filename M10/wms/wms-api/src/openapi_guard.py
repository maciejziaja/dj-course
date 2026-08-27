"""Runtime enforcement of `openapi.yaml`.

Python has no compile-time guarantee that a dict returned by a handler matches
what the contract promises, and no static type can describe a query string that
arrives as `?limit=abc`. So the guarantee is bought at runtime instead: every
request is validated against the contract *before* the handler runs, and every
response *before* it leaves the process.

`openapi-core` does the actual work. This module is the Flask wiring around it:

* one `before_request` / `after_request` pair covering the whole app, so adding a
  route cannot accidentally skip validation - the contrast with a per-view
  decorator, which is opt-in and therefore forgettable;
* the contract's failures mapped onto the error envelope this API already uses
  (`topology/errors.py`), so a validation 400 reads like every other 400;
* a mode switch, because request validation and response validation have very
  different risk profiles in production.

Modes (`OPENAPI_VALIDATION`):

    off       nothing is validated
    request   requests are validated; a violation is a 400. Responses untouched.
    observe   as `request`, plus responses are validated and violations are
              logged. The client still gets the original response. (default)
    strict    as `observe`, but a response violation becomes a 500. This is what
              CI and the test suite run: a contract that drifts fails the build.

`observe` is the useful production default: a response that no longer matches the
contract is a bug worth an alert, but not worth breaking a client that is coping
with it fine.
"""
import os
from typing import Any, Dict, List, Optional

from flask import g, jsonify, make_response, request
from openapi_core import OpenAPI
from openapi_core.contrib.flask import FlaskOpenAPIRequest, FlaskOpenAPIResponse
from openapi_core.deserializing.media_types.exceptions import MediaTypeDeserializeError
from openapi_core.templating.media_types.exceptions import MediaTypeNotFound
from openapi_core.templating.paths.exceptions import (OperationNotFound, PathError, PathNotFound,
                                                      ServerNotFound)
from openapi_core.validation.request.exceptions import (MissingRequestBodyError, ParameterValidationError,
                                                        RequestBodyValidationError, SecurityValidationError)
from openapi_core.validation.schemas.exceptions import InvalidSchemaValue

from logger import logger
from topology.errors import ApiError

SPEC_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'openapi.yaml')

MODES = ('off', 'request', 'observe', 'strict')
DEFAULT_MODE = 'observe'

# `in` location -> the error code the envelope reports. Keeps a bad header
# distinguishable from a bad query string without inventing a new envelope.
_PARAM_ERROR_CODE = {
    'query': 'invalid_query',
    'header': 'invalid_header',
    'path': 'invalid_path',
    'cookie': 'invalid_cookie',
}


class _NormalisedRequest(FlaskOpenAPIRequest):
    """A Flask request whose path pattern is matched the way the contract writes it.

    `openapi-core` derives the pattern from the matched Flask rule, so a
    blueprint registered as `/health/` would only ever match a spec path of
    `/health/`. Publishing paths with trailing slashes to please the validator
    would be the tail wagging the dog, so the slash is dropped here instead.
    `scripts/lint_spec.py` applies the identical rule when it cross-checks the
    contract against the route table, so the two cannot disagree.
    """

    @property
    def path_pattern(self) -> str:
        pattern = super().path_pattern
        return pattern.rstrip('/') or '/'


def _cause_of(exc: BaseException, wanted: type):
    """The first exception of type `wanted` in this exception's cause chain."""
    for cause in _iter_causes(exc):
        if isinstance(cause, wanted):
            return cause
    return None


def _schema_details(exc: BaseException, root: str = '(body)') -> List[Dict[str, str]]:
    """Turn a jsonschema failure into the `details` list the envelope already uses.

    The interesting error is usually two links down the `__cause__` chain:
    `InvalidRequestBody` <- `InvalidSchemaValue` <- the jsonschema errors. `root`
    names the value itself, for the errors that carry no path into it - the
    parameter name for a scalar parameter, `(body)` for a request body.
    """
    invalid = _cause_of(exc, InvalidSchemaValue)
    if invalid is None:
        return []
    return [
        {'field': '.'.join(str(part) for part in error.absolute_path) or root,
         'message': error.message}
        for error in invalid.schema_errors
    ]


def _as_api_error(exc: BaseException) -> ApiError:
    """Map an openapi-core request failure onto this API's error envelope."""
    if isinstance(exc, ParameterValidationError):
        code = _PARAM_ERROR_CODE.get(exc.location, 'invalid_query')
        message = f"{exc.location.capitalize()} parameter '{exc.name}' does not match the contract."
        return ApiError(code, message, 400, parameter=exc.name, location=exc.location,
                        details=_schema_details(exc, root=exc.name))

    if isinstance(exc, MissingRequestBodyError):
        return ApiError('invalid_body', 'A JSON object body is required.', 400)

    # An unusable Content-Type surfaces as a body error wrapping a
    # MediaTypeNotFound; that deserves 415 rather than a 400 with nothing in it.
    media_type_error = _cause_of(exc, MediaTypeNotFound)
    if media_type_error is not None:
        accepted = ', '.join(media_type_error.availableMimetypes)
        return ApiError('unsupported_media_type',
                        f"Content-Type '{media_type_error.mimetype}' is not accepted here; "
                        f'this operation expects {accepted}.', 415,
                        accepted=list(media_type_error.availableMimetypes))

    # A body that is not parseable at all is a different complaint from a body
    # that parsed and then failed the schema; saying so saves the caller a hunt.
    if _cause_of(exc, MediaTypeDeserializeError) is not None:
        return ApiError('invalid_body',
                        'The request body could not be parsed as JSON.', 400)

    if isinstance(exc, RequestBodyValidationError):
        details = _schema_details(exc)
        return ApiError('invalid_body', 'Request body failed validation.', 400, details=details)

    if isinstance(exc, SecurityValidationError):
        return ApiError('unauthorized', 'The request did not satisfy the declared security scheme.', 401)

    if isinstance(exc, OperationNotFound):
        return ApiError('method_not_allowed',
                        f'{exc.method.upper()} is not documented for {exc.url}.', 405)

    # PathNotFound / ServerNotFound / anything else: the contract does not
    # describe this call at all. That is a defect in openapi.yaml, not in the
    # caller's request, so it is reported as a server-side error.
    return ApiError('contract_gap', 'This endpoint is not described by the API contract.', 500)


def _iter_causes(exc: BaseException):
    seen = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        yield exc
        exc = exc.__cause__ or exc.__context__


def _describe(exc: BaseException) -> str:
    """A log line for one violation - and never anything more than that.

    `str()` on an openapi-core error is not safe: `DeserializeError.__str__`
    decodes the offending body as UTF-8, so a request carrying arbitrary bytes
    raises `UnicodeDecodeError` from inside the error message. Rendering a
    complaint must not itself fail, or a 400 turns into a 500.
    """
    try:
        root = exc.name if isinstance(exc, ParameterValidationError) else '(body)'
        details = _schema_details(exc, root=root)
        if details:
            return '; '.join(f"{item['field']}: {item['message']}" for item in details)
        return f'{type(exc).__name__}: {exc}'
    except Exception:  # noqa: BLE001
        return f'{type(exc).__name__}: <not renderable>'


class OpenAPIGuard:
    """Validates every request and response of a Flask app against an OpenAPI file."""

    def __init__(self, spec_path: str = SPEC_PATH, mode: Optional[str] = None):
        self.spec_path = spec_path
        self.mode = (mode or os.environ.get('OPENAPI_VALIDATION') or DEFAULT_MODE).strip().lower()
        if self.mode not in MODES:
            raise ValueError(f"OPENAPI_VALIDATION must be one of {', '.join(MODES)}, got '{self.mode}'")
        self.openapi: Optional[OpenAPI] = None

    # --- lifecycle --------------------------------------------------------

    @property
    def validates_requests(self) -> bool:
        return self.mode in ('request', 'observe', 'strict')

    @property
    def validates_responses(self) -> bool:
        return self.mode in ('observe', 'strict')

    def init_app(self, app) -> 'OpenAPIGuard':
        if self.mode == 'off':
            logger.warning('OpenAPI contract validation is OFF')
            return self

        self.openapi = OpenAPI.from_file_path(self.spec_path)
        app.before_request(self._before_request)
        app.after_request(self._after_request)
        app.extensions['openapi_guard'] = self
        logger.info(f"OpenAPI contract validation is ON (mode={self.mode}, spec={self.spec_path})")
        return self

    # --- hooks ------------------------------------------------------------

    def _skip(self) -> bool:
        """Anything Flask routed nowhere, or that the contract never describes."""
        return request.url_rule is None or request.method in ('OPTIONS', 'HEAD')

    def _before_request(self):
        if not self.validates_requests or self._skip():
            return None

        openapi_request = _NormalisedRequest(request)
        # `unmarshal_request` collects failures on the result rather than raising,
        # so the errors have to be read off it explicitly. Reading them all means
        # a caller who got three things wrong hears about three things.
        result = self.openapi.unmarshal_request(openapi_request)
        errors = list(result.errors)
        if not errors:
            g.openapi = result
            return None

        api_error = _as_api_error(errors[0])
        if len(errors) > 1:
            api_error.extra.setdefault('other_violations',
                                       [_describe(error) for error in errors[1:]][:10])
        summary = ' | '.join(_describe(error) for error in errors)
        if api_error.http_status >= 500:
            logger.error(f'Contract gap on {request.method} {request.path}: {summary}')
        else:
            logger.info(f'Rejected {request.method} {request.path}: {summary}')
        raise api_error

    def _after_request(self, response):
        if not self.validates_responses or self._skip():
            return response
        # A 5xx is already a failure being reported; re-validating it only ever
        # turns one error into a less informative one.
        if response.status_code >= 500:
            return response

        openapi_request = _NormalisedRequest(request)
        errors = list(self.openapi.iter_response_errors(
            openapi_request, FlaskOpenAPIResponse(response)))
        if not errors:
            return response

        summary = ' | '.join(_describe(error) for error in errors)
        logger.error(f'Response contract violation on {request.method} {request.path} '
                     f'-> {response.status_code}: {summary}')
        if self.mode != 'strict':
            return response

        # Built here rather than raised: Flask runs no error handler for an
        # exception thrown from an `after_request` hook, so raising would escape
        # as a bare 500 with an HTML body - itself a contract violation.
        violation = ApiError(
            'response_contract_violation',
            'The response did not match the API contract and was withheld.',
            500,
            operation=f'{request.method} {request.path}',
            status=response.status_code,
            violations=[_describe(error) for error in errors][:20],
        )
        return make_response(jsonify(violation.to_dict()), violation.http_status)


def init_openapi_guard(app, mode: Optional[str] = None) -> OpenAPIGuard:
    return OpenAPIGuard(mode=mode).init_app(app)


def openapi_params(location: str) -> Dict[str, Any]:
    """The unmarshalled parameters for the current request.

    `openapi-core` casts against the contract's schema, so `?limit=50` arrives
    here as the int `50` and `?dry_run=true` as a `str` matching the declared
    enum - the typing the raw `request.args` cannot give. Handlers written before
    the guard existed still read `request.args` directly; new ones can use this.
    """
    result = getattr(g, 'openapi', None)
    if result is None:
        return {}
    return dict(getattr(result.parameters, location, {}) or {})
