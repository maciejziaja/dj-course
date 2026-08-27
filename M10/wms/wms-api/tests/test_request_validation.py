"""What the guard rejects on the way in.

Every case here is refused by `openapi.yaml` before the view function runs, which
is why they are safe to run against a live database: nothing reaches the SQL.
"""
import pytest


def body(response):
    return response.get_json()


# --- query string ---------------------------------------------------------

@pytest.mark.parametrize('url, parameter', [
    ('/shelves?limit=abc', 'limit'),                 # not an integer
    ('/shelves?limit=99999', 'limit'),               # above maximum
    ('/shelves?limit=0', 'limit'),                   # below minimum
    ('/shelves?page=0', 'page'),                     # 1-based
    ('/shelves?page=-3', 'page'),
    ('/shelves?max_weight_gte=heavy', 'max_weight_gte'),
    ('/shelves?max_volume_gte=big', 'max_volume_gte'),
    ('/shelves?warehouse=all', 'warehouse'),
    ('/locations?limit=nope', 'limit'),
    ('/warehouses?page=one', 'page'),
    ('/payments?party_id=someone', 'party_id'),
])
def test_bad_query_parameter_is_rejected(client, url, parameter):
    response = client.get(url)
    assert response.status_code == 400, response.get_data(as_text=True)
    payload = body(response)
    assert payload['error'] == 'invalid_query'
    assert payload['parameter'] == parameter
    assert payload['location'] == 'query'


def test_enum_query_parameter_is_rejected(client, seeded):
    response = client.get(f"/warehouses/{seeded['warehouse']}/layout?depth=atom")
    assert response.status_code == 400
    payload = body(response)
    assert payload['error'] == 'invalid_query'
    assert payload['parameter'] == 'depth'
    assert 'atom' in payload['details'][0]['message']


@pytest.mark.parametrize('value', ['maybe', 'TRUE-ish', '2'])
def test_boolean_query_parameter_spelling_is_enforced(client, seeded, value):
    response = client.delete(f"/shelves/{seeded['shelf']}?dry_run={value}")
    assert response.status_code == 400
    assert body(response)['parameter'] == 'dry_run'


@pytest.mark.parametrize('value', ['true', 'false', '1', '0', 'yes', 'no'])
def test_documented_boolean_spellings_are_accepted(client, seeded, value):
    """The contract lists exactly the spellings `bool_arg` accepts."""
    response = client.delete(f"/shelves/{seeded['shelf']}?dry_run={value}")
    assert response.status_code != 400


def test_valid_query_parameters_pass_through(client):
    assert client.get('/shelves?limit=5&page=1&zone=BULK').status_code == 200


# --- headers --------------------------------------------------------------

def test_malformed_declared_header_is_rejected(client, seeded):
    response = client.patch(f"/shelves/{seeded['shelf']}",
                            json={'max_weight': 700},
                            headers={'X-Request-Id': 'not-a-uuid'})
    assert response.status_code == 400
    payload = body(response)
    assert payload['error'] == 'invalid_header'
    assert payload['location'] == 'header'
    assert payload['parameter'] == 'X-Request-Id'


def test_absent_optional_header_is_fine(client, seeded):
    response = client.get(f"/warehouses/{seeded['warehouse']}")
    assert response.status_code == 200


def test_undeclared_header_is_ignored(client):
    """Only headers the contract names are checked; the rest are none of its business."""
    response = client.get('/shelves?limit=1', headers={'X-Whatever': 'anything at all'})
    assert response.status_code == 200


# --- media type -----------------------------------------------------------

def test_wrong_content_type_is_415(client, seeded):
    response = client.post(f"/warehouses/{seeded['warehouse']}/zones",
                           data='code=X&name=Y',
                           content_type='application/x-www-form-urlencoded')
    assert response.status_code == 415, response.get_data(as_text=True)
    payload = body(response)
    assert payload['error'] == 'unsupported_media_type'
    assert 'application/json' in payload['accepted']


@pytest.mark.parametrize('payload, label', [
    (b'<\x05\xef.z\x1d', 'arbitrary bytes that are not even UTF-8'),
    (b'not json at all', 'text'),
    (b'{"unclosed": ', 'truncated JSON'),
    (b'[1, 2, 3]', 'valid JSON, but an array where an object is required'),
    (b'"a string"', 'valid JSON, but a scalar'),
])
def test_unparseable_body_is_400_not_500(client, seeded, payload, label):
    """Found by the fuzzer, and the failure was in the error path itself.

    openapi-core's `DeserializeError.__str__` decodes the offending body as
    UTF-8, so building the log line for a request full of arbitrary bytes raised
    `UnicodeDecodeError` and the 400 escaped as a 500. Rendering a complaint must
    never fail.
    """
    response = client.patch(f"/racks/{seeded['rack']}", data=payload,
                            content_type='application/json')
    assert response.status_code == 400, f'{label}: {response.get_data(as_text=True)[:200]}'
    assert body(response)['error'] == 'invalid_body'


def test_missing_body_is_rejected(client, seeded):
    response = client.post(f"/warehouses/{seeded['warehouse']}/zones")
    assert response.status_code in (400, 415)
    assert body(response)['error'] in ('invalid_body', 'unsupported_media_type')


# --- request bodies -------------------------------------------------------

@pytest.mark.parametrize('payload, expected_field', [
    ({}, '(body)'),                                                  # name is required
    ({'name': 123, 'location_id': 1}, 'name'),                       # wrong type
    ({'name': '', 'location_id': 1}, 'name'),                        # minLength
    ({'name': 'x', 'location_id': 0}, 'location_id'),                # exclusiveMinimum
    ({'name': 'x', 'location_id': 1, 'oops': True}, '(body)'),       # additionalProperties
])
def test_warehouse_create_body_is_validated(client, payload, expected_field):
    response = client.post('/warehouses', json=payload)
    assert response.status_code == 400, response.get_data(as_text=True)
    result = body(response)
    assert result['error'] == 'invalid_body'
    assert any(detail['field'] == expected_field for detail in result['details']), result['details']


@pytest.mark.parametrize('code', ['BAD-CODE', 'has space', 'x' * 17, ''])
def test_zone_code_pattern_is_enforced(client, seeded, code):
    response = client.post(f"/warehouses/{seeded['warehouse']}/zones",
                           json={'code': code, 'name': 'Some zone'})
    assert response.status_code == 400
    assert body(response)['error'] == 'invalid_body'


@pytest.mark.parametrize('measure', [
    -5,
    0,
    {'value': 5, 'unit': 'stone'},      # unit not in the enum
    {'value': -5, 'unit': 'kg'},
    {'unit': 'kg'},                     # value is required
    {'value': 5, 'unit': 'kg', 'x': 1},  # additionalProperties
    'heavy',
])
def test_weight_measure_is_validated(client, seeded, measure):
    response = client.post(f"/racks/{seeded['rack']}/shelves",
                           json={'level': 'ZZ', 'max_weight': measure, 'max_volume': 1})
    assert response.status_code == 400, response.get_data(as_text=True)
    assert body(response)['error'] == 'invalid_body'


@pytest.mark.parametrize('measure', [5, 5.5, {'value': 5, 'unit': 'kg'},
                                     {'value': 5000, 'unit': 'g'}, {'value': 0.5, 'unit': 't'}])
def test_documented_weight_spellings_are_accepted(client, seeded, measure):
    """A bare number means the base unit; an explicit unit is normalised on write.

    `?dry_run=true` is not available on this endpoint, so the shape is exercised
    through the generate endpoint, which does support it and writes nothing.
    """
    response = client.post(
        f"/racks/{seeded['rack']}/shelves:generate?dry_run=true",
        json={'levels': ['ZZ'], 'max_weight': measure, 'max_volume': 1})
    assert response.status_code == 200, response.get_data(as_text=True)
    assert body(response)['would_create'] == {'shelves': 1}


def test_empty_patch_body_is_rejected(client, seeded):
    response = client.patch(f"/shelves/{seeded['shelf']}", json={})
    assert response.status_code == 400
    assert body(response)['error'] == 'invalid_body'


def test_bulk_patch_requires_ids(client):
    response = client.patch('/shelves:bulk', json={'ids': [], 'patch': {'max_weight': 10}})
    assert response.status_code == 400
    assert body(response)['error'] == 'invalid_body'


def test_layout_naming_template_is_pinned(client, seeded):
    response = client.post(f"/warehouses/{seeded['warehouse']}/layout",
                           json={'naming': '{zone}/{aisle}',
                                 'zones': [{'code': 'X', 'name': 'x'}]})
    assert response.status_code == 400
    assert body(response)['error'] == 'invalid_body'


def test_layout_zone_cap_is_enforced_by_the_contract(client, seeded):
    """51 zones is refused by `maxItems`, before any expansion work happens."""
    zones = [{'code': f'Z{i}', 'name': f'Zone {i}'} for i in range(51)]
    response = client.post(f"/warehouses/{seeded['warehouse']}/layout", json={'zones': zones})
    assert response.status_code == 400
    assert body(response)['error'] == 'invalid_body'


def test_several_violations_are_reported_together(client):
    """A caller who got two things wrong should not have to guess at the second."""
    response = client.post('/warehouses', json={'name': 123, 'location_id': -1})
    assert response.status_code == 400
    fields = {detail['field'] for detail in body(response)['details']}
    assert {'name', 'location_id'} <= fields, fields
