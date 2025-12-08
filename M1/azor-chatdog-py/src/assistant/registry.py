"""
Assistant registry for mapping assistant IDs to factory functions.
Provides functions to get an assistant by ID, list available assistants, and register new assistants.
"""
from typing import Callable, Dict, List

from .assistent import Assistant
from .azor import create_azor_assistant
from .perfectionist import create_perfectionist_assistant
from .businessman import create_businessman_assistant
from .optimist import create_optimist_assistant

# Internal registry mapping assistant_id -> factory function
_ASSISTANT_REGISTRY: Dict[str, Callable[[], Assistant]] = {
    "azor": create_azor_assistant,
    "perfectionist": create_perfectionist_assistant,
    "businessman": create_businessman_assistant,
    "optimist": create_optimist_assistant,
}


def register_assistant(assistant_id: str, factory_function: Callable[[], Assistant]) -> None:
    """Register or override an assistant factory by its ID.

    Args:
        assistant_id: Unique identifier for the assistant (e.g., "azor").
        factory_function: Zero-arg callable returning an Assistant instance.
    """
    if not isinstance(assistant_id, str) or not assistant_id:
        raise ValueError("assistant_id must be a non-empty string")
    if not callable(factory_function):
        raise ValueError("factory_function must be callable")
    _ASSISTANT_REGISTRY[assistant_id] = factory_function


def get_assistant_by_id(assistant_id: str) -> Assistant:
    """Return an Assistant instance for a given ID.

    Raises ValueError if the ID is unknown.
    """
    factory = _ASSISTANT_REGISTRY.get(assistant_id)
    if factory is None:
        available = ", ".join(sorted(_ASSISTANT_REGISTRY.keys()))
        raise ValueError(f"Unknown assistant_id '{assistant_id}'. Available: {available}")
    return factory()


def list_available_assistants() -> List[Dict[str, str]]:
    """List available assistants with their IDs and display names.

    Returns a list of dictionaries: {"id": <assistant_id>, "name": <Assistant.name>}.
    """
    result: List[Dict[str, str]] = []
    for asst_id, factory in _ASSISTANT_REGISTRY.items():
        try:
            asst = factory()
            result.append({"id": asst_id, "name": asst.name})
        except Exception:
            # If factory creation fails, still list the ID
            result.append({"id": asst_id, "name": asst_id})
    # Sort by ID for deterministic output
    result.sort(key=lambda x: x["id"]) 
    return result
