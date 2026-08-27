#!/bin/bash
# Rebuild wms-api/.venv from scratch.
#
# openapi-core (the runtime contract guard) needs Python >= 3.10, so this picks
# the newest interpreter it can find rather than whatever `python3` happens to be.
set -euo pipefail

PY=$(command -v python3.13 || command -v python3.12 || command -v python3.11 \
     || command -v python3.10 || command -v python3)

rm -rf .venv
"$PY" -m venv .venv
echo "📦 Created .venv with $("$PY" --version)"

# `[dev]` adds pytest, openapi-spec-validator and schemathesis; see pyproject.toml.
if command -v uv >/dev/null 2>&1; then
  uv pip install --python .venv/bin/python -e ".[dev]"
else
  .venv/bin/python -m pip install -e ".[dev]"
fi

echo "✅ Done. Run the contract checks with: task contract"
