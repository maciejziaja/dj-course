"""
Utilities for persisting runtime-tunable LLM parameters (top_p, top_k, temperature).
"""

import json
import os
from typing import Any, Dict

from files.config import LOG_DIR

PARAMETERS_FILE = os.path.join(LOG_DIR, 'llm_parameters.json')

DEFAULT_PARAMETERS: Dict[str, Any] = {
    "top_p": None,
    "top_k": None,
    "temp": None,
}


def _ensure_file_exists() -> None:
    """Ensure the parameters file exists with default values."""
    if not os.path.exists(PARAMETERS_FILE):
        save_parameters(DEFAULT_PARAMETERS)


def load_parameters() -> Dict[str, Any]:
    """Load parameters from disk, falling back to defaults."""
    try:
        _ensure_file_exists()
        with open(PARAMETERS_FILE, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
            # Ensure all expected keys exist
            for key, default_value in DEFAULT_PARAMETERS.items():
                data.setdefault(key, default_value)
            return data
    except (json.JSONDecodeError, OSError):
        return DEFAULT_PARAMETERS.copy()


def save_parameters(data: Dict[str, Any]) -> None:
    """Persist parameters to disk."""
    os.makedirs(os.path.dirname(PARAMETERS_FILE), exist_ok=True)
    with open(PARAMETERS_FILE, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, indent=2)


def set_parameter(name: str, value: Any) -> None:
    """Set a parameter value and persist."""
    parameters = load_parameters()
    parameters[name] = value
    save_parameters(parameters)


def clear_parameter(name: str) -> None:
    """Clear a parameter (set to None) and persist."""
    parameters = load_parameters()
    parameters[name] = None
    save_parameters(parameters)


def get_parameter(name: str) -> Any:
    """Return a single parameter value (or None if missing)."""
    parameters = load_parameters()
    return parameters.get(name)


def get_sampling_parameters() -> Dict[str, Any]:
    """Convenience helper returning all sampling parameters."""
    return load_parameters()


