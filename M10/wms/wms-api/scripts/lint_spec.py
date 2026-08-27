#!/usr/bin/env python
"""Two checks on `openapi.yaml`, neither of which needs a running server.

1. Is it a structurally valid OpenAPI 3.0 document?
2. Does it describe *this* application - every Flask rule documented, and every
   documented operation actually routed?

The second check is the one that keeps the contract honest. A spec that
validates but omits half the routes is worse than no spec at all, because it
looks authoritative.

Run: python scripts/lint_spec.py
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'src'))

SPEC_PATH = os.path.join(REPO, 'openapi.yaml')
HTTP_METHODS = ('get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace')

# `<int:warehouse_id>` -> `{warehouse_id}`, matching openapi-core's own rewrite.
_CONVERTER = re.compile(r'<(?:[^:>]+:)?([^>]+)>')


def rule_to_openapi_path(rule: str) -> str:
    """The OpenAPI path a Flask rule corresponds to.

    Trailing slashes are dropped so the published contract can say `/health`
    rather than `/health/`; `src/openapi_guard.py` applies the same rule at
    runtime, so the two never disagree.
    """
    path = _CONVERTER.sub(r'{\1}', rule)
    return path.rstrip('/') or '/'


def flask_operations():
    """{(path, method)} actually served by the app."""
    os.environ.setdefault('SERVICE_NAME', 'wms-api')
    os.environ.setdefault('OPENAPI_VALIDATION', 'off')
    # Importing the app builds a SQLAlchemy engine but never connects, so a
    # placeholder URL is enough to read the route table offline.
    os.environ.setdefault('POSTGRES_URL', 'postgresql+psycopg2://unused@localhost/unused')
    from application import app

    found = set()
    for rule in app.url_map.iter_rules():
        if rule.endpoint == 'static':
            continue
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            found.add((rule_to_openapi_path(rule.rule), method.lower()))
    return found


def spec_operations(spec):
    return {
        (path, method)
        for path, item in spec['paths'].items()
        for method in item
        if method in HTTP_METHODS
    }


def main() -> int:
    from openapi_spec_validator import validate
    from openapi_spec_validator.readers import read_from_filename

    spec, base_uri = read_from_filename(SPEC_PATH)
    validate(spec, base_uri=base_uri)
    documented = spec_operations(spec)
    print(f'✅ openapi.yaml is a valid OpenAPI {spec["openapi"]} document '
          f'({len(spec["paths"])} paths, {len(documented)} operations)')

    served = flask_operations()
    undocumented = sorted(served - documented)
    unrouted = sorted(documented - served)

    for path, method in undocumented:
        print(f'❌ served but not documented: {method.upper():6} {path}')
    for path, method in unrouted:
        print(f'❌ documented but not served: {method.upper():6} {path}')

    if undocumented or unrouted:
        print(f'\n{len(undocumented) + len(unrouted)} mismatch(es) between '
              f'openapi.yaml and the Flask route table.')
        return 1

    print(f'✅ contract and route table agree on all {len(served)} operations')
    return 0


if __name__ == '__main__':
    sys.exit(main())
