"""
Command handlers for managing runtime LLM sampling parameters.
"""

from typing import Optional

from cli import console
from files import parameter_store

PARAMETER_RULES = {
    "top_p": {
        "type": float,
        "min": 0.0,
        "max": 1.0,
        "description": "Top P (0.0 - 1.0)",
    },
    "top_k": {
        "type": int,
        "min": 0,
        "max": 2048,
        "description": "Top K (0 - 2048)",
    },
    "temp": {
        "type": float,
        "min": 0.0,
        "max": 2.0,
        "description": "Temperature (0.0 - 2.0)",
    },
}


def _display_current_parameters() -> None:
    """Print currently stored parameter values."""
    parameters = parameter_store.load_parameters()
    console.print_help("\nAktualne ustawienia parametrów LLM:")
    for name in ("top_p", "top_k", "temp"):
        value = parameters.get(name)
        formatted = value if value is not None else "— (nieustawiony)"
        console.print_info(f"  {name}: {formatted}")


def handle_set_command(parameter_name: Optional[str], value_text: Optional[str]) -> None:
    """Dispatch the /set command logic."""
    if not parameter_name:
        _display_current_parameters()
        console.print_help("\nAby ustawić lub wyczyścić wartość użyj: /set <top_p|top_k|temp> [value]")
        return

    parameter_key = parameter_name.lower()

    if parameter_key not in PARAMETER_RULES:
        console.print_error(f"Błąd: Nieznany parametr: {parameter_name}. Dostępne: top_p, top_k, temp.")
        return

    if value_text is None:
        parameter_store.clear_parameter(parameter_key)
        console.print_assistant(f"Parametr {parameter_key} został wyczyszczony.")
        return

    rule = PARAMETER_RULES[parameter_key]

    try:
        parsed_value = rule["type"](value_text)
    except ValueError:
        console.print_error(f"Błąd: Wartość '{value_text}' jest nieprawidłowa dla parametru {parameter_key}.")
        return

    min_value = rule["min"]
    max_value = rule["max"]

    if parsed_value < min_value or parsed_value > max_value:
        console.print_error(
            f"Błąd: {rule['description']}."
        )
        return

    parameter_store.set_parameter(parameter_key, parsed_value)
    console.print_assistant(f"Parametr {parameter_key} ustawiony na {parsed_value}.")


