from files import session_files
from cli import console

def list_sessions_command():
    """Displays a formatted list of available sessions with titles."""
    sessions = session_files.list_sessions()
    if sessions:
        console.print_help("\n--- Dostępne zapisane sesje ---")
        
        # Column widths
        id_width = 36  # Full UUID length
        title_width = 30
        msg_width = 12
        date_width = 16
        
        # Header
        header = f"{'ID':<{id_width}} {'Tytuł':<{title_width}} {'Wiadomości':<{msg_width}} {'Ost. aktywność':<{date_width}}"
        console.print_help(header)
        separator = "-" * len(header)
        console.print_help(separator)
        
        for session in sessions:
            if session.get('error'):
                error_line = f"{session['id']:<{id_width}} {'BŁĄD ODCZYTU':<{title_width}} {'-':<{msg_width}} {'-':<{date_width}}"
                console.print_error(error_line)
            else:
                # Get title or fallback to placeholder
                title = session.get('title')
                if not title:
                    title = "--- brak ---"
                
                # Truncate title to fit column width (30 chars)
                if len(title) > title_width:
                    display_title = title[:title_width-3] + "..."
                else:
                    display_title = title
                
                # Format the line
                line = (
                    f"{session['id']:<{id_width}} "
                    f"{display_title:<{title_width}} "
                    f"{str(session['messages_count']):<{msg_width}} "
                    f"{session['last_activity']:<{date_width}}"
                )
                console.print_help(line)
        
        console.print_help(separator)
    else:
        console.print_help("\nBrak zapisanych sesji.")
