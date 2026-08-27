"""Turning a declarative template into rows to insert.

`POST /warehouses/{id}/layout` and the three `:generate` endpoints all say the
same thing in different scopes - "these labels, with these dimensions" - so the
expansion, the cross-checks and the limits live here once.
"""
from typing import Any, Dict, List, Sequence

from topology.errors import ApiError
from topology.labels import (LEVEL_PATTERN, MAX_AISLES_PER_ZONE, MAX_RACKS_PER_AISLE,
                             MAX_SHELVES_PER_RACK, MAX_SHELVES_PER_REQUEST, cross_check, expand)
from topology.repository import existing_labels


def expand_aisles(template) -> List[str]:
    labels = expand(template.labels, 'aisles.labels', MAX_AISLES_PER_ZONE)
    cross_check(getattr(template, 'count', None), labels, 'aisles.count', 'aisles.labels')
    return labels


def expand_racks(template) -> List[str]:
    labels = expand(template.labels, 'racks.labels', MAX_RACKS_PER_AISLE)
    cross_check(getattr(template, 'per_aisle', None), labels, 'racks.per_aisle', 'racks.labels')
    return labels


def expand_levels(template) -> List[str]:
    levels = expand(template.levels, 'shelves.levels', MAX_SHELVES_PER_RACK, LEVEL_PATTERN)
    cross_check(getattr(template, 'per_rack', None), levels, 'shelves.per_rack', 'shelves.levels')
    return levels


def check_shelf_budget(total_shelves: int) -> None:
    if total_shelves > MAX_SHELVES_PER_REQUEST:
        raise ApiError('limit_exceeded',
                       f'This request would create {total_shelves} shelves, the maximum is '
                       f'{MAX_SHELVES_PER_REQUEST}.', 400,
                       limit=MAX_SHELVES_PER_REQUEST, requested=total_shelves)


def check_collisions(conn, level: str, parent_id: int, labels: Sequence[str],
                     what: str) -> None:
    """Answer with the colliding labels rather than a raw constraint violation."""
    taken = set(existing_labels(conn, level, parent_id))
    collisions = [label for label in labels if label in taken]
    if collisions:
        code = {'zone': 'duplicate_code', 'shelf': 'duplicate_level'}.get(level, 'duplicate_label')
        raise ApiError(code,
                       f"{what} already taken: {', '.join(collisions[:20])}.", 409,
                       conflicts=collisions[:20], conflict_count=len(collisions))


def aisle_rows(zone_id: int, labels: Sequence[str], width) -> List[Dict[str, Any]]:
    return [{'zone_id': zone_id, 'label': label,
             'width': width.value, 'width_unit': width.unit} for label in labels]


def rack_rows(aisle_ids: Sequence[int], labels: Sequence[str], max_height) -> List[Dict[str, Any]]:
    return [{'aisle_id': aisle_id, 'label': label,
             'max_height': max_height.value, 'height_unit': max_height.unit}
            for aisle_id in aisle_ids for label in labels]


def shelf_rows(rack_ids: Sequence[int], levels: Sequence[str],
               max_weight, max_volume) -> List[Dict[str, Any]]:
    weight, volume = max_weight.to_kg(), max_volume.to_m3()
    return [{'rack_id': rack_id, 'level': level, 'max_weight': weight, 'max_volume': volume}
            for rack_id in rack_ids for level in levels]
