"""Label ranges: "01..08" -> ["01", ..., "08"].

The one piece of pure logic in this package with real edge cases, so it carries
its own self-check: `python -m topology.labels`.

Rules:
* a range is `<left>..<right>`; the non-numeric prefix must match on both sides
* the zero-padding is taken from the left operand ("01..10" -> "01".."10")
* the range must not run backwards, and it is bounded by an explicit maximum
* an explicit list is accepted as-is (no duplicates)
* labels are restricted to [A-Za-z0-9_] because "-" separates the segments of
  the composed shelf path A-01-R001-L4
"""
import re
from typing import List, Sequence, Union

from topology.errors import ApiError

LABEL_PATTERN = re.compile(r'^[A-Za-z0-9_]{1,16}$')
LEVEL_PATTERN = re.compile(r'^[A-Za-z0-9_]{1,8}$')
_RANGE_OPERAND = re.compile(r'^(?P<prefix>[A-Za-z_]*)(?P<digits>\d+)$')

# Hard limits (D11 of the plan): one order of magnitude above the use case, so a
# typo in a range is a 400 instead of an outage.
MAX_ZONES_PER_LAYOUT = 50
MAX_AISLES_PER_ZONE = 200
MAX_RACKS_PER_AISLE = 200
MAX_SHELVES_PER_RACK = 50
MAX_SHELVES_PER_REQUEST = 5000
MAX_BULK_IDS = 5000

LabelSpec = Union[str, Sequence[str]]


def expand(spec: LabelSpec, field: str, max_count: int,
           pattern: re.Pattern = LABEL_PATTERN) -> List[str]:
    """Turn a range string, a single label or an explicit list into labels."""
    if isinstance(spec, str):
        labels = _expand_range(spec, field) if '..' in spec else [spec]
    elif isinstance(spec, (list, tuple)):
        labels = [str(item) for item in spec]
    else:
        raise ApiError('invalid_range', f"'{field}' must be a range string or a list of labels.", 400)

    if not labels:
        raise ApiError('invalid_range', f"'{field}' expands to nothing.", 400)
    if len(labels) > max_count:
        raise ApiError('limit_exceeded',
                       f"'{field}' expands to {len(labels)} entries, the maximum is {max_count}.", 400,
                       limit=max_count, requested=len(labels))
    duplicates = sorted({label for label in labels if labels.count(label) > 1})
    if duplicates:
        raise ApiError('invalid_range', f"'{field}' contains duplicates: {', '.join(duplicates)}.", 400)
    for label in labels:
        validate_label(label, field, pattern)
    return labels


def validate_label(label: str, field: str, pattern: re.Pattern = LABEL_PATTERN) -> str:
    if not isinstance(label, str) or not pattern.match(label):
        raise ApiError('invalid_label',
                       f"'{field}' must match {pattern.pattern} - '-' is reserved as the "
                       f"separator of the composed shelf path (got '{label}').", 400)
    return label


def _expand_range(spec: str, field: str) -> List[str]:
    parts = spec.split('..')
    if len(parts) != 2:
        raise ApiError('invalid_range', f"'{field}': a range looks like '01..08' (got '{spec}').", 400)

    left, right = (part.strip() for part in parts)
    left_match, right_match = _RANGE_OPERAND.match(left), _RANGE_OPERAND.match(right)
    if not left_match or not right_match:
        raise ApiError('invalid_range',
                       f"'{field}': both ends of a range must end in digits (got '{spec}').", 400)
    if left_match.group('prefix') != right_match.group('prefix'):
        raise ApiError('invalid_range',
                       f"'{field}': the prefix must match on both ends of a range "
                       f"('{left_match.group('prefix')}' vs '{right_match.group('prefix')}').", 400)

    prefix = left_match.group('prefix')
    start, end = int(left_match.group('digits')), int(right_match.group('digits'))
    if end < start:
        raise ApiError('invalid_range', f"'{field}': the range '{spec}' runs backwards.", 400)

    width = len(left_match.group('digits'))
    return ['{}{:0{}d}'.format(prefix, number, width) for number in range(start, end + 1)]


def cross_check(count, labels: List[str], count_field: str, labels_field: str) -> None:
    """`count` / `per_aisle` / `per_rack` are optional cross-checks (D9)."""
    if count is None:
        return
    if count != len(labels):
        raise ApiError('inconsistent_request',
                       f"'{count_field}' says {count} but '{labels_field}' expands to {len(labels)}.", 400,
                       expected=count, actual=len(labels))


def _self_check() -> None:
    def expect(spec, expected, **kwargs):
        actual = expand(spec, 'labels', kwargs.pop('max_count', 1000), **kwargs)
        assert actual == expected, f"{spec!r} -> {actual!r}, expected {expected!r}"

    def expect_error(spec, fragment, **kwargs):
        try:
            expand(spec, 'labels', kwargs.pop('max_count', 1000), **kwargs)
        except ApiError as exc:
            assert fragment in exc.message, f"{spec!r} -> {exc.message!r}, expected {fragment!r}"
        else:
            raise AssertionError(f"{spec!r} was accepted, expected an error")

    expect('01..08', ['01', '02', '03', '04', '05', '06', '07', '08'])
    expect('R01..R20', ['R{:02d}'.format(n) for n in range(1, 21)])
    expect('1..5', ['1', '2', '3', '4', '5'])
    expect('008..011', ['008', '009', '010', '011'])          # padding from the left operand
    expect('7..7', ['7'])                                     # single-element range
    expect('A1', ['A1'])                                      # a single label, not a range
    expect(['A01', 'B02'], ['A01', 'B02'])                    # explicit list
    expect('98..102', ['98', '99', '100', '101', '102'])      # padding is a minimum width, not a cap

    expect_error('R01..A20', 'prefix must match')
    expect_error('08..01', 'runs backwards')
    expect_error('01..05..09', "looks like")
    expect_error('A..Z', 'must end in digits')
    expect_error('01..99', 'maximum is 10', max_count=10)
    expect_error(['A01', 'A01'], 'duplicates')
    expect_error('A-01', 'separator')
    expect_error('01..02', 'separator', pattern=re.compile(r'^X$'))
    expect_error([], 'expands to nothing')
    expect_error(42, 'range string or a list')

    assert expand('1..4', 'levels', 50, pattern=LEVEL_PATTERN) == ['1', '2', '3', '4']
    cross_check(4, ['1', '2', '3', '4'], 'per_rack', 'levels')
    try:
        cross_check(5, ['1', '2', '3', '4'], 'per_rack', 'levels')
    except ApiError as exc:
        assert 'says 5' in exc.message
    else:
        raise AssertionError('a mismatched cross-check was accepted')

    print('labels self-check: all cases pass')


if __name__ == '__main__':
    _self_check()
