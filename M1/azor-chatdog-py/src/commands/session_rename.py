from session import get_session_manager
from cli import console

def rename_session_command(new_title: str):
    """
    Renames the current session title.
    
    Args:
        new_title: The new title for the session
    """
    manager = get_session_manager()
    current = manager.get_current_session()
    
    if not new_title:
        console.print_error("Błąd: Użycie: /session rename NEW_TITLE")
        return
    
    # Join all words as the title (in case it was split)
    title = new_title.strip()
    
    success = current.set_title(title)
    if success:
        console.print_info(f"Zmieniono tytuł sesji na: \"{current.get_title()}\"")
    else:
        console.print_error("Błąd: Tytuł musi mieć co najmniej 3 znaki (po usunięciu białych znaków).")

