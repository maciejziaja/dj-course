from cli import console
from assistant.registry import get_assistant_by_id, list_available_assistants


def switch_assistant_command(session, assistant_id: str) -> None:
    """
    Switches the assistant for the given session.

    Args:
        session: Current ChatSession instance
        assistant_id: Target assistant ID
    """
    if not assistant_id:
        console.print_error("Błąd: Użycie: /assistant <ID>")
        return

    try:
        # Validate and obtain assistant display name
        asst = get_assistant_by_id(assistant_id)
        target_name = asst.name
    except Exception as e:
        console.print_error(str(e))
        # Show available IDs for convenience
        available = ', '.join([a['id'] for a in list_available_assistants()])
        console.print_info(f"Dostępne identyfikatory: {available}")
        return

    # Perform switch on the session
    session.switch_assistant(assistant_id)
    console.print_info(f"\n--- Przełączono na asystenta: {target_name} ---")
