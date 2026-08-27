#!/usr/bin/env python
"""Generate `src/contract/models.py` from the contract.

Every response shape and request body in `openapi.yaml`, as a pydantic v2 model.
Nothing in `src/` imports these at runtime - the guard validates against the
contract document itself, which is a stronger check than a model can be, because
it covers query strings, headers and status codes too. What the models are for is
everything that reads the API *in Python with a type checker looking*: the test
suite unpacks responses through them, so `mypy` knows that `warehouse.location.city`
is a `str` and that `warehouse.description` can be `None`, and says so before the
code runs rather than after.

They are generated, never edited: `--strict-nullable` is what makes a required
`nullable: true` field come out as `str | None` instead of a lie.

    python scripts/generate_models.py            # write the models
    python scripts/generate_models.py --check    # fail if they are stale
"""
import argparse
import os
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, 'openapi.yaml')
OUTPUT = os.path.join(REPO, 'src', 'contract', 'models.py')


def generate(destination: str) -> None:
    codegen = os.path.join(os.path.dirname(sys.executable), 'datamodel-codegen')
    subprocess.run(
        [codegen if os.path.exists(codegen) else 'datamodel-codegen',
         '--input', SPEC,
         '--input-file-type', 'openapi',
         # Component schemas only. The path-derived models datamodel-codegen can
         # also emit duplicate these under uglier names.
         '--openapi-scopes', 'schemas',
         '--output', destination,
         '--output-model-type', 'pydantic_v2.BaseModel',
         '--target-python-version', '3.10',
         # A timestamp in the header would make every regeneration a diff, and
         # `--check` would then always fail.
         '--disable-timestamp',
         # `nullable: true` on a required field means `str | None`, not `str`.
         '--strict-nullable',
         '--use-schema-description', '--use-field-description',
         '--field-constraints', '--use-annotated', '--collapse-root-models',
         # `unit` is an enum of three strings, not a Python Enum: a Literal both
         # matches how `topology/measures.py` writes it and lets the schema's own
         # default ('mm') typecheck against it.
         '--enum-field-as-literal', 'all'],
        check=True, capture_output=True, text=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='exit 1 if the committed models differ from the contract')
    args = parser.parse_args()

    relative = os.path.relpath(OUTPUT, REPO)
    try:
        if not args.check:
            generate(OUTPUT)
            print(f'🧬 {relative} regenerated from openapi.yaml')
            return 0

        with tempfile.TemporaryDirectory() as directory:
            candidate = os.path.join(directory, 'models.py')
            generate(candidate)
            with open(candidate, encoding='utf-8') as handle:
                fresh = handle.read()
    except subprocess.CalledProcessError as exc:
        print(f'❌ datamodel-codegen failed:\n{exc.stderr}')
        return 1

    current = ''
    if os.path.exists(OUTPUT):
        with open(OUTPUT, encoding='utf-8') as handle:
            current = handle.read()
    if current == fresh:
        print(f'✅ {relative} is up to date with openapi.yaml')
        return 0
    print(f'❌ {relative} no longer matches openapi.yaml.')
    print('   Run `task contract-models` and commit the result.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
