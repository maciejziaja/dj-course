"""Shared fixtures.

The suite runs the real application against the real database, with the guard in
`strict` mode - a response that does not match `openapi.yaml` becomes a 500 and
therefore a failing test. That is the whole point: the contract is only worth
something if drift breaks the build.
"""
import os

import pytest
from sqlalchemy import text

os.environ.setdefault('SERVICE_NAME', 'wms-api')
os.environ.setdefault(
    'POSTGRES_URL',
    'postgresql+psycopg2://admin:strongpassword123@localhost:5432/deliveroo')
# Set before `application` is imported, so the guard picks it up at init.
os.environ['OPENAPI_VALIDATION'] = 'strict'


@pytest.fixture(scope='session')
def flask_app():
    from application import app as flask_application

    from database import db_engine
    try:
        with db_engine.connect() as conn:
            conn.execute(text('SELECT 1'))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f'PostgreSQL is not reachable, skipping the suite: {exc}')

    flask_application.config['TESTING'] = True
    return flask_application


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()


@pytest.fixture(scope='session')
def guard(flask_app):
    return flask_app.extensions['openapi_guard']


@pytest.fixture(scope='session')
def seeded(flask_app):
    """Ids of rows the fixture data is known to contain, one per level.

    Read-only tests need *something* to address; picking the lowest id of each
    table keeps them independent of how much data the generator produced.
    """
    from database import db_engine

    ids = {}
    with db_engine.connect() as conn:
        for key, table, pk in (('warehouse', 'warehouse', 'warehouse_id'),
                               ('zone', 'zone', 'zone_id'),
                               ('aisle', 'aisle', 'aisle_id'),
                               ('rack', 'rack', 'rack_id'),
                               ('shelf', 'shelf', 'shelf_id'),
                               ('location', 'location', 'location_id')):
            ids[key] = conn.execute(text(f'SELECT min({pk}) FROM {table}')).scalar()
        ids['employee'] = conn.execute(text(
            "SELECT min(party_id) FROM party WHERE data->>'type' = 'employee'")).scalar()
        ids['contractor'] = conn.execute(text(
            "SELECT min(party_id) FROM party WHERE data->>'type' = 'contractor_company'")).scalar()
        ids['storage_record'] = conn.execute(text(
            'SELECT min(storage_record_id) FROM cargo_event_history')).scalar()

    missing = [key for key, value in ids.items() if value is None]
    if missing:
        pytest.skip(f'The database holds no rows for: {", ".join(missing)}')
    return ids


@pytest.fixture
def scratch_warehouse(client):
    """A warehouse created for one test and cascade-deleted afterwards.

    Write paths need somewhere to write. Building a private subtree keeps the
    tests from depending on - or damaging - the generated fixture data.
    """
    response = client.post('/warehouses', json={
        'name': 'pytest scratch warehouse',
        'location': {'address': 'ul. Testowa 1', 'city': 'Testowo',
                     'postal_code': '00-001', 'country': 'Poland'},
    })
    assert response.status_code == 201, response.get_data(as_text=True)
    warehouse_id = response.get_json()['id']

    created_zones = []
    yield warehouse_id, created_zones

    for zone_id in created_zones:
        client.delete(f'/zones/{zone_id}?cascade=true')
    from database import db_engine
    with db_engine.begin() as conn:
        conn.execute(text('DELETE FROM zone WHERE warehouse_id = :id'), {'id': warehouse_id})
        conn.execute(text('DELETE FROM warehouse WHERE warehouse_id = :id'), {'id': warehouse_id})
