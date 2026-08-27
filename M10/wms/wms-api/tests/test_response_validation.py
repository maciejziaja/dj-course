"""What the guard checks on the way out.

The suite runs in `strict` mode, so any response that does not match
`openapi.yaml` is turned into a 500 by the guard. Every test below therefore
asserts a *2xx/4xx* status - and in doing so asserts that the body matched the
contract, field by field, including the timestamp and decimal renderings that
the legacy endpoints get wrong in the interesting way.
"""
import json

import pytest


def read_endpoints(seeded):
    warehouse, zone = seeded['warehouse'], seeded['zone']
    aisle, rack, shelf = seeded['aisle'], seeded['rack'], seeded['shelf']
    return [
        ('/health', 200),
        (f"/storage/{seeded['storage_record']}/events", 200),
        ('/employees/', 200),
        (f"/employees/{seeded['employee']}", 200),
        ('/employees/999999999', 404),
        (f'/warehouse/{warehouse}', 200),
        ('/contractors/', 200),
        (f"/contractors/{seeded['contractor']}", 200),
        ('/contractors/999999999', 404),
        ('/payments/', 200),
        ('/payments/?status=PAID', 200),
        ('/locations', 200),
        ('/locations?limit=2&page=1', 200),
        ('/locations?country=Poland', 200),
        ('/warehouses', 200),
        (f'/warehouses/{warehouse}', 200),
        ('/warehouses/999999999', 404),
        (f'/warehouses/{warehouse}/zones', 200),
        (f'/warehouses/{warehouse}/layout', 200),
        (f'/warehouses/{warehouse}/layout?depth=zone', 200),
        (f'/warehouses/{warehouse}/layout?depth=aisle', 200),
        (f'/warehouses/{warehouse}/layout?depth=rack', 200),
        (f'/warehouses/{warehouse}/layout?depth=shelf', 200),
        (f'/zones/{zone}', 200),
        ('/zones/999999999', 404),
        (f'/zones/{zone}/aisles', 200),
        (f'/aisles/{aisle}', 200),
        (f'/aisles/{aisle}/racks', 200),
        (f'/racks/{rack}', 200),
        (f'/racks/{rack}/shelves', 200),
        ('/shelves', 200),
        ('/shelves?limit=5', 200),
        ('/shelves?zone=BULK', 200),
        ('/shelves?code=%25-L1', 200),
        ('/shelves?max_weight_gte=1', 200),
        (f'/shelves/{shelf}', 200),
        ('/shelves/999999999', 404),
    ]


def test_every_read_endpoint_matches_the_contract(client, seeded):
    """The broad sweep: one strict pass over every documented read.

    Run as a single test with an explicit report rather than a parametrised one,
    so a contract drift shows every affected endpoint at once instead of the
    first alphabetically.
    """
    failures = []
    for url, expected in read_endpoints(seeded):
        response = client.get(url)
        if response.status_code != expected:
            failures.append(f'GET {url}: expected {expected}, got {response.status_code}\n'
                            f'    {response.get_data(as_text=True)[:600]}')
    assert not failures, 'contract violations:\n' + '\n'.join(failures)


def test_guard_is_actually_in_strict_mode(guard):
    assert guard.mode == 'strict'
    assert guard.validates_requests and guard.validates_responses


def test_a_response_that_breaks_the_contract_is_caught(client, flask_app, seeded):
    """The test that makes every other test in this file meaningful.

    A passing suite could mean the contract is right, or it could mean the guard
    never looks. Breaking one response on purpose distinguishes the two.
    """
    from flask import jsonify

    endpoint = 'zones_bp.get_zone'
    original = flask_app.view_functions[endpoint]

    def drifted(zone_id):
        # `code` is declared a string and is required; both promises broken.
        return jsonify({'id': zone_id, 'warehouse_id': 1, 'code_typo': 42,
                        'name': 'x', 'description': None,
                        'created_at': '2026-01-01T00:00:00', 'updated_at': '2026-01-01T00:00:00'})

    flask_app.view_functions[endpoint] = drifted
    try:
        response = client.get(f"/zones/{seeded['zone']}")
    finally:
        flask_app.view_functions[endpoint] = original

    assert response.status_code == 500, 'strict mode let a broken response through'
    payload = response.get_json()
    assert payload['error'] == 'response_contract_violation'
    assert payload['violations'], 'the violation should say what did not match'

    # And the endpoint is healthy again once the drift is removed.
    assert client.get(f"/zones/{seeded['zone']}").status_code == 200


def test_observe_mode_reports_but_does_not_block(client, flask_app, seeded, guard):
    """`observe` is the production default: log the violation, ship the response."""
    from flask import jsonify

    endpoint = 'zones_bp.get_zone'
    original = flask_app.view_functions[endpoint]
    flask_app.view_functions[endpoint] = lambda zone_id: jsonify({'nonsense': True})
    guard.mode = 'observe'
    try:
        response = client.get(f"/zones/{seeded['zone']}")
    finally:
        flask_app.view_functions[endpoint] = original
        guard.mode = 'strict'

    assert response.status_code == 200
    assert response.get_json() == {'nonsense': True}


# --- the renderings the legacy endpoints get wrong in an interesting way ----

def test_legacy_timestamps_are_http_dates_not_rfc3339(client, seeded):
    """Flask's JSON encoder emits RFC 1123; the contract says so rather than lying.

    Declaring `format: date-time` here would be wrong *and* would fail at
    runtime, because RFC 3339 requires an offset this string does not have.
    """
    payload = client.get(f"/employees/{seeded['employee']}").get_json()
    hire_date = payload['hire_date']
    if hire_date is not None:
        assert hire_date.endswith(' GMT'), hire_date
        assert ',' in hire_date  # 'Sun, 28 May 2023 11:50:53 GMT'


def test_topology_timestamps_are_naive_iso(client, seeded):
    payload = client.get(f"/warehouses/{seeded['warehouse']}").get_json()
    assert 'T' in payload['created_at']
    assert not payload['created_at'].endswith('Z')
    assert '+' not in payload['created_at']


def test_payment_amounts_are_decimal_strings(client):
    payments = client.get('/payments/').get_json()
    amounts = [payment['amount'] for payment in payments if payment['amount'] is not None]
    if amounts:
        assert all(isinstance(amount, str) for amount in amounts), amounts


def test_shelf_catalogue_carries_the_path_but_single_reads_do_not(client, seeded):
    """Two genuinely different shapes, so the contract has two schemas."""
    catalogue = client.get('/shelves?limit=1').get_json()['items']
    if catalogue:
        assert {'warehouse_id', 'zone', 'aisle', 'rack'} <= set(catalogue[0])
    single = client.get(f"/shelves/{seeded['shelf']}").get_json()
    assert 'warehouse_id' not in single
    assert 'code' in single


# --- writes ---------------------------------------------------------------

def test_dry_runs_match_the_contract_and_write_nothing(client, seeded):
    """Every declarative write has a dry run; all four are documented shapes."""
    warehouse, zone, aisle, rack = (seeded['warehouse'], seeded['zone'],
                                    seeded['aisle'], seeded['rack'])
    cases = [
        (f'/warehouses/{warehouse}/layout?dry_run=true',
         {'zones': [{'code': 'DRYRUN', 'name': 'Dry run zone',
                     'aisles': {'labels': 'D01..D04', 'width': {'value': 200, 'unit': 'cm'}}}]},
         'would_create'),
        (f'/zones/{zone}/aisles:generate?dry_run=true',
         {'labels': 'D01..D03', 'width': 2000}, 'would_create'),
        (f'/aisles/{aisle}/racks:generate?dry_run=true',
         {'labels': 'D001..D005', 'max_height': {'value': 4, 'unit': 'm'}}, 'would_create'),
        (f'/racks/{rack}/shelves:generate?dry_run=true',
         {'levels': '7..9', 'max_weight': 500, 'max_volume': 2}, 'would_create'),
    ]
    for url, payload, key in cases:
        response = client.post(url, json=payload)
        assert response.status_code == 200, f'{url}: {response.get_data(as_text=True)[:500]}'
        assert key in response.get_json()

    # Nothing was written: the dry run above claimed four aisles for the zone.
    assert client.get(f'/zones/{zone}/aisles').status_code == 200


def test_create_read_delete_round_trip(client, scratch_warehouse):
    """One real write path, end to end, with every response validated in strict mode."""
    warehouse_id, created_zones = scratch_warehouse

    zone = client.post(f'/warehouses/{warehouse_id}/zones',
                       json={'code': 'RT', 'name': 'Round trip zone'})
    assert zone.status_code == 201, zone.get_data(as_text=True)
    zone_id = zone.get_json()['id']
    created_zones.append(zone_id)

    aisle = client.post(f'/zones/{zone_id}/aisles',
                        json={'label': 'A01', 'width': {'value': 250, 'unit': 'cm'}})
    assert aisle.status_code == 201, aisle.get_data(as_text=True)
    aisle_id = aisle.get_json()['id']

    rack = client.post(f'/aisles/{aisle_id}/racks',
                       json={'label': 'R001', 'max_height': {'value': 5, 'unit': 'm'}})
    assert rack.status_code == 201, rack.get_data(as_text=True)
    rack_id = rack.get_json()['id']

    shelf = client.post(f'/racks/{rack_id}/shelves',
                        json={'level': '1', 'max_weight': {'value': 800, 'unit': 'kg'},
                              'max_volume': {'value': 3, 'unit': 'm3'}})
    assert shelf.status_code == 201, shelf.get_data(as_text=True)
    shelf_body = shelf.get_json()
    shelf_id = shelf_body['id']
    assert shelf_body['code'] == 'RT-A01-R001-L1'

    # Units are normalised on write and read back in the base unit.
    grams = client.post(f'/racks/{rack_id}/shelves',
                        json={'level': '2', 'max_weight': {'value': 500000, 'unit': 'g'},
                              'max_volume': {'value': 1500, 'unit': 'l'}})
    assert grams.status_code == 201, grams.get_data(as_text=True)
    assert grams.get_json()['max_weight'] == {'value': 500, 'unit': 'kg'}
    assert grams.get_json()['max_volume'] == {'value': 1.5, 'unit': 'm3'}

    assert client.get(f'/shelves/{shelf_id}').status_code == 200
    assert client.get(f'/warehouses/{warehouse_id}/layout?depth=shelf').status_code == 200

    patched = client.patch(f'/shelves/{shelf_id}', json={'max_weight': {'value': 1, 'unit': 't'}})
    assert patched.status_code == 200, patched.get_data(as_text=True)
    assert patched.get_json()['max_weight'] == {'value': 1000, 'unit': 'kg'}

    bulk = client.patch('/shelves:bulk',
                        json={'ids': [shelf_id], 'patch': {'max_volume': 4}})
    assert bulk.status_code == 200, bulk.get_data(as_text=True)
    assert bulk.get_json()['updated'] == 1

    missing = client.patch('/shelves:bulk',
                           json={'ids': [shelf_id, 999999999], 'patch': {'max_volume': 4}})
    assert missing.status_code == 404
    assert missing.get_json()['missing'] == [999999999]

    dry = client.delete(f'/zones/{zone_id}?cascade=true&dry_run=true')
    assert dry.status_code == 200, dry.get_data(as_text=True)
    assert dry.get_json()['would_delete']['shelves'] == 2

    blocked = client.delete(f'/zones/{zone_id}')
    assert blocked.status_code == 409
    assert blocked.get_json()['error'] == 'has_children'

    assert client.delete(f'/zones/{zone_id}?cascade=true').status_code == 204
    created_zones.remove(zone_id)


def test_duplicate_zone_code_is_a_documented_conflict(client, scratch_warehouse):
    warehouse_id, created_zones = scratch_warehouse
    first = client.post(f'/warehouses/{warehouse_id}/zones',
                        json={'code': 'DUP', 'name': 'First'})
    assert first.status_code == 201
    created_zones.append(first.get_json()['id'])

    second = client.post(f'/warehouses/{warehouse_id}/zones',
                         json={'code': 'DUP', 'name': 'Second'})
    assert second.status_code == 409, second.get_data(as_text=True)
    assert second.get_json()['error'] == 'duplicate_code'
