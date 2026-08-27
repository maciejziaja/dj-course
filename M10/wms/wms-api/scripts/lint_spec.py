#!/usr/bin/env python
"""Two checks on `openapi.yaml`, neither of which needs a running server.

1. Is it a structurally valid OpenAPI 3.0 document?
2. Does it describe *this* application - every Flask rule documented, and every
   documented operation actually routed?

The second check is the one that keeps the contract honest. A spec that
validates but omits half the routes is worse than no spec at all, because it
looks authoritative. It is the same check `src/openapi_guard.py` runs when the
app starts - imported from there rather than reimplemented, so the two cannot
drift apart - but here it runs without a database or a server.

Run: python scripts/lint_spec.py
"""
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'src'))

SPEC_PATH = os.path.join(REPO, 'openapi.yaml')

# Set before anything under src/ is imported: the modules there read their
# configuration at import time. Importing the app builds a SQLAlchemy engine but
# never connects, so a placeholder URL is enough to read the route table offline.
os.environ.setdefault('SERVICE_NAME', 'wms-api')
os.environ.setdefault('OPENAPI_VALIDATION', 'off')
os.environ.setdefault('POSTGRES_URL', 'postgresql+psycopg2://unused@localhost/unused')


def flask_app():
    from application import app
    return app


def main() -> int:
    from openapi_spec_validator import validate
    from openapi_spec_validator.readers import read_from_filename

    from openapi_guard import coverage_gaps, spec_operations

    spec, base_uri = read_from_filename(SPEC_PATH)
    validate(spec, base_uri=base_uri)
    print(f'✅ openapi.yaml is a valid OpenAPI {spec["openapi"]} document '
          f'({len(spec["paths"])} paths, {len(spec_operations(spec["paths"]))} operations)')

    undocumented, unrouted = coverage_gaps(flask_app(), spec['paths'])
    for path, method in undocumented:
        print(f'❌ served but not documented: {method.upper():6} {path}')
    for path, method in unrouted:
        print(f'❌ documented but not served: {method.upper():6} {path}')

    if undocumented or unrouted:
        print(f'\n{len(undocumented) + len(unrouted)} mismatch(es) between '
              f'openapi.yaml and the Flask route table.')
        return 1

    print('✅ contract and route table agree on all '
          f'{len(spec_operations(spec["paths"]))} operations')
    return 0


if __name__ == '__main__':
    sys.exit(main())
