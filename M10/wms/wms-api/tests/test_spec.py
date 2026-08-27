"""The contract as a document: is it valid, and does it describe this app?

These tests need neither a database nor a server.
"""
import os
import sys

import pytest

SCRIPTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts')
sys.path.insert(0, SCRIPTS)

from lint_spec import SPEC_PATH  # noqa: E402
from openapi_guard import coverage_gaps  # noqa: E402


@pytest.fixture(scope='module')
def spec():
    from openapi_spec_validator.readers import read_from_filename
    document, base_uri = read_from_filename(SPEC_PATH)
    return document, base_uri


def test_spec_is_a_valid_openapi_document(spec):
    from openapi_spec_validator import validate
    document, base_uri = spec
    validate(document, base_uri=base_uri)


def test_every_route_is_documented(spec, flask_app):
    """A spec that omits routes is worse than none - it looks authoritative."""
    document, _ = spec
    undocumented, unrouted = coverage_gaps(flask_app, document['paths'])
    assert undocumented == [], 'served by Flask but missing from openapi.yaml'
    assert unrouted == [], 'documented in openapi.yaml but not routed'


def test_every_operation_has_an_operation_id(spec):
    """Client generators key off operationId; a missing one produces a nameless method."""
    document, _ = spec
    missing = [
        f'{method.upper()} {path}'
        for path, item in document['paths'].items()
        for method, operation in item.items()
        if method in ('get', 'post', 'patch', 'put', 'delete') and 'operationId' not in operation
    ]
    assert missing == []


def test_operation_ids_are_unique(spec):
    document, _ = spec
    ids = [
        operation['operationId']
        for item in document['paths'].values()
        for method, operation in item.items()
        if method in ('get', 'post', 'patch', 'put', 'delete')
    ]
    duplicates = sorted({name for name in ids if ids.count(name) > 1})
    assert duplicates == []


def test_every_operation_is_tagged(spec):
    """Untagged operations fall into an unnamed bucket in the rendered docs."""
    document, _ = spec
    declared = {tag['name'] for tag in document.get('tags', [])}
    problems = []
    for path, item in document['paths'].items():
        for method, operation in item.items():
            if method not in ('get', 'post', 'patch', 'put', 'delete'):
                continue
            tags = operation.get('tags') or []
            if not tags:
                problems.append(f'{method.upper()} {path}: no tags')
            for tag in tags:
                if tag not in declared:
                    problems.append(f'{method.upper()} {path}: undeclared tag {tag!r}')
    assert problems == []


def _operations(document):
    for path, item in document['paths'].items():
        for method, operation in item.items():
            if method in ('get', 'post', 'patch', 'put', 'delete'):
                yield path, method, operation


def _resolve_parameter(document, parameter):
    if '$ref' in parameter:
        return document['components']['parameters'][parameter['$ref'].rsplit('/', 1)[1]]
    return parameter


def test_every_operation_with_input_documents_a_400(spec):
    """The guard rejects bad input with a 400 - which must itself be documented.

    Otherwise strict mode turns the guard's own rejection into a 500, because the
    contract never said a 400 was possible. This rule is why `GET /payments`
    needed one.
    """
    document, _ = spec
    gaps = []
    for path, method, operation in _operations(document):
        checkable = [
            _resolve_parameter(document, parameter)
            for parameter in operation.get('parameters', [])
        ]
        # Path parameters count too: ids are int32, so an oversized one is a 400
        # from the guard long before the handler or the database sees it.
        if (checkable or 'requestBody' in operation) and '400' not in operation['responses']:
            gaps.append(f'{method.upper()} {path}')
    assert gaps == []


def test_every_operation_with_a_path_parameter_documents_a_404(spec):
    """A path parameter that does not parse never reaches the handler.

    Werkzeug fails to route it and the app's `NotFound` handler answers 404, so
    every operation addressed by id can produce one whether or not its own code
    ever says `not found`.
    """
    document, _ = spec
    gaps = [
        f'{method.upper()} {path}'
        for path, method, operation in _operations(document)
        if any(_resolve_parameter(document, parameter)['in'] == 'path'
               for parameter in operation.get('parameters', []))
        and '404' not in operation['responses']
    ]
    assert gaps == []


def test_every_operation_with_a_body_documents_a_415(spec):
    """A wrong Content-Type is a 415 from the guard; same reasoning as the 400."""
    document, _ = spec
    gaps = [
        f'{method.upper()} {path}'
        for path, method, operation in _operations(document)
        if 'requestBody' in operation and '415' not in operation['responses']
    ]
    assert gaps == []


def test_no_component_is_unused(spec):
    """An orphaned schema is a sign the contract and the code have parted ways."""
    import json
    document, _ = spec
    body = json.dumps(document)
    orphans = []
    for section in ('schemas', 'parameters', 'responses'):
        for name in document['components'].get(section, {}):
            if f'#/components/{section}/{name}' not in body:
                orphans.append(f'{section}/{name}')
    assert orphans == []


# ---------------------------------------------------------------------------
# The contract is assembled from openapi/ and the models are generated from the
# result. Both are committed, so both can go stale - and a stale artefact is a
# lie that looks authoritative. These are the checks that catch it without a CI
# server: they run in the same suite as everything else.
# ---------------------------------------------------------------------------

def test_openapi_yaml_is_the_bundle_of_the_openapi_directory():
    """`openapi.yaml` is generated; if it drifted, someone edited the wrong file."""
    from bundle_spec import BUNDLE, Bundler
    with open(BUNDLE, encoding='utf-8') as handle:
        committed = handle.read()
    assert committed == Bundler().bundle(), (
        'openapi.yaml no longer matches openapi/ - run `task contract-bundle`')


def test_generated_models_match_the_contract():
    import subprocess
    result = subprocess.run(
        [sys.executable, os.path.join(SCRIPTS, 'generate_models.py'), '--check'],
        capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_coverage_gaps_sees_a_route_the_contract_does_not_describe(flask_app):
    """The check itself, on a contract that is deliberately wrong."""
    from openapi_guard import coverage_gaps
    undocumented, unrouted = coverage_gaps(flask_app, {'/health': {'get': {}},
                                                       '/invented': {'get': {}}})
    assert ('/invented', 'get') in unrouted
    assert ('/shelves', 'get') in undocumented


def test_strict_mode_refuses_to_start_against_a_contract_that_misses_a_route():
    """The gate that does not need CI: drift stops the process, not a build server."""
    from flask import Flask

    from openapi_guard import OpenAPIGuard

    app = Flask('contract-gate-test')
    app.add_url_rule('/not-in-the-contract', 'invented', lambda: '')
    with pytest.raises(RuntimeError, match='does not match the route table'):
        OpenAPIGuard(mode='strict').init_app(app)
