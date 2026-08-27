#!/usr/bin/env python
"""Assemble `openapi/` into the single `openapi.yaml` every tool reads.

The contract is the source of truth, and a 2500-line YAML file is a bad place to
keep a source of truth: every edit collides with every other edit. So the truth
lives split across `openapi/` - one file per resource, one per group of schemas -
and this script glues it back together.

    openapi/openapi.yaml     the root: info, tags, and an index of $refs
    openapi/paths/*.yaml     path items, grouped by resource
    openapi/components/      parameters, responses, schemas

Only the *file* refs (`$ref: './paths/zones.yaml#/~1zones'`) are followed here.
Refs into the document itself (`$ref: '#/components/schemas/Zone'`) are left
exactly as written: they already point at the assembled root, which is where they
resolve. That is why the fragments under `openapi/` are not standalone OpenAPI
documents and are not linted as such - `openapi.yaml` is the document, and it is
what `task contract-lint`, the test suite, schemathesis, Redocly and the runtime
guard all load.

Round-tripped through ruamel.yaml, so comments and formatting survive the trip
and the bundle stays readable rather than turning into machine soup.

    python scripts/bundle_spec.py            # write openapi.yaml
    python scripts/bundle_spec.py --check    # fail if openapi.yaml is stale
"""
import argparse
import copy
import io
import os
import sys
from typing import Any, Dict, Tuple

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_ROOT = os.path.join(REPO, 'openapi', 'openapi.yaml')
BUNDLE = os.path.join(REPO, 'openapi.yaml')

HEADER = """\
# =============================================================================
# GENERATED FILE - do not edit.
#
# Assembled from openapi/ by `task contract-bundle` (scripts/bundle_spec.py).
# Edit the fragments under openapi/ instead; `task contract-lint` fails if this
# file no longer matches them, and so does the test suite and app start-up.
# =============================================================================
"""


def _yaml() -> YAML:
    yaml = YAML()
    yaml.preserve_quotes = True
    # Wide enough that no scalar gets re-wrapped on the way through; the point of
    # a round trip is that the output still looks like what was written.
    yaml.width = 4096
    yaml.indent(mapping=2, sequence=4, offset=2)
    return yaml


def _unescape(token: str) -> str:
    """JSON Pointer escaping: `~1` is `/`, `~0` is `~` (RFC 6901, in that order)."""
    return token.replace('~1', '/').replace('~0', '~')


def _resolve_pointer(doc: Any, fragment: str, source: str) -> Any:
    node = doc
    for token in fragment.lstrip('#').strip('/').split('/'):
        if not token:
            continue
        key = _unescape(token)
        try:
            node = node[key]
        except (KeyError, TypeError) as exc:
            raise SystemExit(f'{source}: cannot resolve "{fragment}" - no "{key}"') from exc
    return node


class Bundler:
    def __init__(self):
        self.yaml = _yaml()
        self._documents: Dict[str, Any] = {}

    def _document(self, path: str) -> Any:
        if path not in self._documents:
            if not os.path.exists(path):
                raise SystemExit(f'missing fragment: {os.path.relpath(path, REPO)}')
            with open(path, encoding='utf-8') as handle:
                self._documents[path] = self.yaml.load(handle)
        return self._documents[path]

    def _external_ref(self, node: Any) -> Tuple[str, str]:
        """('file', 'fragment') if this node is a `$ref` into another file."""
        if isinstance(node, dict) and '$ref' in node:
            ref = node['$ref']
            if isinstance(ref, str) and not ref.startswith('#'):
                file_part, _, fragment = ref.partition('#')
                return file_part, fragment
        return '', ''

    def _inline(self, node: Any, base_dir: str) -> Any:
        """The node this one stands for, with its own refs already resolved."""
        file_part, fragment = self._external_ref(node)
        if not file_part:
            return node
        target = os.path.normpath(os.path.join(base_dir, file_part))
        resolved = _resolve_pointer(self._document(target), fragment, os.path.relpath(target, REPO))
        # A copy per use: the same fragment may be referenced twice, and the two
        # copies must not end up aliased in the bundle.
        resolved = copy.deepcopy(resolved)
        self._walk(resolved, os.path.dirname(target))
        return resolved

    def _walk(self, node: Any, base_dir: str) -> None:
        """Replace every external ref beneath `node`, in place.

        In place because ruamel keeps a map's comments on the map itself, keyed by
        the child key - rebuilding the container would drop them.
        """
        if isinstance(node, (CommentedMap, dict)):
            for key in list(node.keys()):
                value = node[key]
                inlined = self._inline(value, base_dir)
                if inlined is not value:
                    node[key] = inlined
                else:
                    self._walk(value, base_dir)
        elif isinstance(node, (CommentedSeq, list)):
            for index, value in enumerate(node):
                inlined = self._inline(value, base_dir)
                if inlined is not value:
                    node[index] = inlined
                else:
                    self._walk(value, base_dir)

    def bundle(self) -> str:
        root = copy.deepcopy(self._document(SOURCE_ROOT))
        self._walk(root, os.path.dirname(SOURCE_ROOT))
        stream = io.StringIO()
        stream.write(HEADER)
        self.yaml.dump(root, stream)
        return stream.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='exit 1 if openapi.yaml differs from openapi/, writing nothing')
    args = parser.parse_args()

    bundled = Bundler().bundle()
    relative = os.path.relpath(BUNDLE, REPO)

    if args.check:
        current = ''
        if os.path.exists(BUNDLE):
            with open(BUNDLE, encoding='utf-8') as handle:
                current = handle.read()
        if current == bundled:
            print(f'✅ {relative} is up to date with openapi/')
            return 0
        print(f'❌ {relative} is stale - openapi/ has moved on without it.')
        print('   Run `task contract-bundle` and commit the result.')
        return 1

    with open(BUNDLE, 'w', encoding='utf-8') as handle:
        handle.write(bundled)
    print(f'📦 {relative} ({len(bundled.splitlines())} lines) assembled from openapi/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
