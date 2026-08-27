"""Offset pagination: ?page=1&limit=50, envelope {items, page, limit, total}."""
from typing import Any, Dict, List, Tuple

from topology.errors import ApiError, int_arg

DEFAULT_LIMIT = 50
MAX_LIMIT = 500


def page_params() -> Tuple[int, int, int]:
    """Read ?page= and ?limit= off the request; returns (page, limit, offset)."""
    page = int_arg('page', 1)
    limit = int_arg('limit', DEFAULT_LIMIT)
    if page < 1:
        raise ApiError('invalid_query', "Query parameter 'page' is 1-based and must be >= 1.", 400)
    if limit < 1 or limit > MAX_LIMIT:
        raise ApiError('invalid_query', f"Query parameter 'limit' must be between 1 and {MAX_LIMIT}.", 400)
    return page, limit, (page - 1) * limit


def envelope(items: List[Any], page: int, limit: int, total: int) -> Dict[str, Any]:
    return {'items': items, 'page': page, 'limit': limit, 'total': total}
