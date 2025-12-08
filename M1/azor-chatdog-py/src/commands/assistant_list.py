from cli import console
from assistant.registry import list_available_assistants


def list_assistants_command(session) -> None:
    """
    Displays the list of available assistants and highlights the currently selected one.

    Args:
        session: Current ChatSession instance (used to determine current assistant_id)
    """
    try:
        current_id = getattr(session, 'assistant_id', 'azor')
    except Exception:
        current_id = 'azor'

    assistants = list_available_assistants()

    console.print_help("Dostępni asystenci:")
    for item in assistants:
        marker = "[*]" if item.get('id') == current_id else "[ ]"
        asst_id = item.get('id')
        name = item.get('name')
        console.print_help(f"  {marker} {asst_id:<14} - {name}")

    console.print_help("")
    console.print_help(f"Aktualnie wybrany: {current_id}")
