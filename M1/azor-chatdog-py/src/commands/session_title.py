from session import get_session_manager
from cli import console

def show_session_title_command():
    """Displays the current session title."""
    manager = get_session_manager()
    current = manager.get_current_session()
    
    title = current.get_title()
    if title:
        console.print_info(f"Tytuł bieżącej sesji: \"{title}\"")
    else:
        console.print_info(f"Ta sesja nie ma jeszcze tytułu (ID: {current.session_id}).")

