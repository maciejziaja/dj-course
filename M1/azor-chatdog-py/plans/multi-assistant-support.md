# Plan Rozbudowy: Obsługa Wielu Asystentów

## 🎯 Cel

Rozszerzenie aplikacji o możliwość pracy z różnymi asystentami w ramach jednej sesji. Każda sesja będzie mogła używać różnych asystentów, które różnią się stylem komunikacji i podejściem do zadań.

## 📋 Nowi Asystenci

### 1. Azor (istniejący)
- **Rola**: Przyjazny asystent-pies, pomocny w rozwiązywaniu problemów
- **Styl**: Uprzejmy, zrozumiały, najlepszy przyjaciel

### 2. Perfekcjonista (nowy)
- **Rola**: Asystent przykładający ogromną wagę do detali
- **Styl**: Skrupulatny, dokładny, zwracający uwagę na każdy szczegół
- **Plik**: `src/assistant/perfectionist.py`

### 3. Biznesmen (nowy)
- **Rola**: Asystent zorientowany na cele, wypowiadający się bardzo rzeczowo i krótko
- **Styl**: Zwięzły, konkretny, skupiony na efektach
- **Plik**: `src/assistant/businessman.py`

### 4. Optymista (nowy)
- **Rola**: Optymistyczny pochlebca, który zawsze pocieszy i dopytuje jak się czujesz
- **Styl**: Pełen entuzjazmu, wspierający, empatyczny
- **Plik**: `src/assistant/optimist.py`

## 🔧 Wymagane Zmiany

### 1. Rejestr Asystentów (`src/assistant/registry.py`)

**Cel**: Centralne miejsce do rejestracji i wyszukiwania asystentów po identyfikatorze.

**Funkcjonalność**:
- Słownik mapujący identyfikatory (string) na funkcje tworzące asystentów
- Funkcja `get_assistant_by_id(assistant_id: str) -> Assistant`
- Funkcja `list_available_assistants() -> List[Dict[str, str]]`
- Funkcja `register_assistant(assistant_id: str, factory_function: Callable)`

**Identyfikatory**:
- `"azor"` → `create_azor_assistant()`
- `"perfectionist"` → `create_perfectionist_assistant()`
- `"businessman"` → `create_businessman_assistant()`
- `"optimist"` → `create_optimist_assistant()`

### 2. Nowe Pliki Asystentów

#### `src/assistant/perfectionist.py`
```python
def create_perfectionist_assistant() -> Assistant:
    assistant_name = "PERFEKCJONISTA"
    system_role = "Jesteś perfekcjonistycznym asystentem, który przykłada ogromną wagę do detali. Twoim priorytetem jest dokładność i kompletność. Zawsze sprawdzasz każdy szczegół, dbasz o precyzję i nie pomijasz niczego ważnego. Upewniasz się, że wszystkie informacje są kompletne i dokładne."
    return Assistant(system_prompt=system_role, name=assistant_name)
```

#### `src/assistant/businessman.py`
```python
def create_businessman_assistant() -> Assistant:
    assistant_name = "BIZNESMEN"
    system_role = "Jesteś biznesowym asystentem zorientowanym na cele. Wypowiadasz się bardzo rzeczowo i krótko. Skupiasz się na konkretach, efektach i działaniach. Unikasz niepotrzebnych słów, zawsze idziesz prosto do sedna."
    return Assistant(system_prompt=system_role, name=assistant_name)
```

#### `src/assistant/optimist.py`
```python
def create_optimist_assistant() -> Assistant:
    assistant_name = "OPTYMISTA"
    system_role = "Jesteś optymistycznym asystentem pełnym entuzjazmu. Zawsze pocieszasz, wspierasz i dopytujesz jak się czujesz. Widzisz pozytywne strony każdej sytuacji. Twoim zadaniem jest poprawianie nastroju użytkownika i motywowanie go."
    return Assistant(system_prompt=system_role, name=assistant_name)
```

### 3. Rozszerzenie Formatów Danych

#### Format Pliku Sesji (`src/files/session_files.py`)

**Obecny format JSON**:
```json
{
  "session_id": "...",
  "model": "...",
  "system_role": "...",
  "history": [...]
}
```

**Nowy format JSON** (rozszerzony):
```json
{
  "session_id": "...",
  "model": "...",
  "assistant_id": "azor",  // NOWE: identyfikator asystenta
  "system_role": "...",     // zachowane dla kompatybilności wstecznej
  "history": [...]
}
```

**Zmiany w `save_session_history()`**:
- Obecna sygnatura: `save_session_history(session_id: str, history: List[Dict], system_prompt: str, model_name: str, title: str | None = None)`
- Dodaj parametr `assistant_id: str | None = None` na końcu (po `title`)
- Nowa sygnatura: `save_session_history(session_id: str, history: List[Dict], system_prompt: str, model_name: str, title: str | None = None, assistant_id: str | None = None)`
- Zapisz `assistant_id` w pliku JSON (tylko jeśli nie jest None)
- Zachowaj istniejący parametr `system_prompt` (dla kompatybilności wstecznej)

**Zmiany w `load_session_history()`**:
- Obecna sygnatura: `load_session_history(session_id: str) -> tuple[List[Dict], str | None, str | None]`
  - Zwraca: `(conversation_history, title, error_message)`
- Nowa sygnatura: `load_session_history(session_id: str) -> tuple[List[Dict], str | None, str | None, str | None]`
  - Zwraca: `(conversation_history, title, assistant_id, error_message)`
- W kodzie: odczytać `assistant_id` z `log_data.get('assistant_id', None)`
- Jeśli plik nie ma `assistant_id`, zwróć `None` (kompatybilność wsteczna - domyślnie "azor")

### 4. Zmiany w `ChatSession` (`src/session/chat_session.py`)

#### Dodanie metody zmiany asystenta

```python
def switch_assistant(self, assistant_id: str) -> None:
    """
    Zmienia asystenta w trakcie sesji i dodaje wpis do historii.
    
    Args:
        assistant_id: ID nowego asystenta (używa rejestru do pobrania)
    """
    from assistant.registry import get_assistant_by_id
    
    old_name = self.assistant.name
    new_assistant = get_assistant_by_id(assistant_id)
    new_name = new_assistant.name
    
    # Dodaj wpis do historii informujący o zmianie
    change_message = {
        "role": "model",
        "parts": [{"text": f"[SYSTEM: Zmiana asystenta z {old_name} na {new_name}]"}]
    }
    self._history.append(change_message)
    
    # Zmień asystenta i assistant_id
    self.assistant = new_assistant
    self.assistant_id = assistant_id
    
    # Reinicjalizuj sesję LLM z nowym system promptem
    self._initialize_llm_session()
    
    # Zapisuj zmianę
    self.save_to_file()
```

#### Zmiany w `__init__()`
- Dodać opcjonalny parametr `assistant_id: str | None = None`
- Dodać pole `self.assistant_id: str` (obok istniejącego `self.assistant: Assistant`)
- W konstruktorze: `self.assistant_id = assistant_id or self._get_assistant_id_from_assistant(assistant)`
- Dodać metodę pomocniczą `_get_assistant_id_from_assistant(assistant: Assistant) -> str` do mapowania `Assistant` → `assistant_id`
  - Mapowanie: sprawdza `assistant.name` i zwraca odpowiedni ID:
    - "AZOR" → "azor"
    - "PERFEKCJONISTA" → "perfectionist"
    - "BIZNESMEN" → "businessman"
    - "OPTYMISTA" → "optimist"
  - Domyślnie zwraca "azor" jeśli nie można zmapować
  - **Alternatywa**: Można użyć rejestru do odwrotnego mapowania (przeszukać wszystkie asystenty i znaleźć pasującego), ale proste mapowanie po nazwie jest prostsze

#### Zmiany w `save_to_file()`
- Obecne wywołanie: `session_files.save_session_history(self.session_id, self._history, self.assistant.system_prompt, self._llm_client.get_model_name(), self._title)`
- Dodać `self.assistant_id` jako ostatni parametr: `session_files.save_session_history(..., self._title, self.assistant_id)`
- Zachować istniejące wywołanie z `self.assistant.system_prompt` (dla kompatybilności wstecznej)

#### Zmiany w `load_from_file()`
- **WAŻNE**: Obecna sygnatura przyjmuje `assistant: Assistant` jako parametr - to trzeba zmienić
- Odczytać `assistant_id` z pliku sesji przez `session_files.load_session_history()`
- Użyć rejestru asystentów do stworzenia odpowiedniego asystenta: `assistant = registry.get_assistant_by_id(assistant_id or "azor")`
- Jeśli `assistant_id` to `None`, użyć "azor" (domyślnie)

**Nowa sygnatura** (zmiana z obecnej):
- Obecna: `load_from_file(cls, assistant: Assistant, session_id: str) -> tuple['ChatSession | None', str | None]`
- Nowa: `load_from_file(cls, session_id: str) -> tuple['ChatSession | None', str | None]`
- **Usunąć parametr `assistant`** - asystent będzie tworzony przez rejestr

**Nowa implementacja**:
```python
@classmethod
def load_from_file(cls, session_id: str) -> tuple['ChatSession | None', str | None]:
    """
    Loads a session from disk, including assistant information.
    Creates the appropriate assistant using the registry.
    """
    from assistant.registry import get_assistant_by_id
    
    history, title, assistant_id, error = session_files.load_session_history(session_id)
    if error:
        return None, error
    
    # Use registry to create assistant
    assistant = get_assistant_by_id(assistant_id or "azor")
    session = cls(assistant=assistant, session_id=session_id, history=history, title=title, assistant_id=assistant_id or "azor")
    return session, None
```

### 5. Zmiany w `SessionManager` (`src/session/session_manager.py`)

#### Aktualizacja `create_new_session()`
- Obecnie: `assistant = create_azor_assistant()` i `ChatSession(assistant=assistant)`
- Dodać opcjonalny parametr `assistant_id: str | None = None`
- Jeśli `None`, użyć domyślnego (np. "azor")
- Zamiast bezpośredniego wywołania `create_azor_assistant()`, użyć rejestru: `from assistant.registry import get_assistant_by_id` i `assistant = get_assistant_by_id(assistant_id or "azor")`
- Przekazać `assistant_id=(assistant_id or "azor")` do konstruktora `ChatSession`

#### Aktualizacja `switch_to_session()`
- Obecnie: `assistant = create_azor_assistant()` i `ChatSession.load_from_file(assistant=assistant, session_id=session_id)`
- Zmienić na: `ChatSession.load_from_file(session_id)` (bez parametru `assistant`)
- `ChatSession.load_from_file()` już będzie tworzyć odpowiedniego asystenta przez rejestr
- Usunąć linię: `assistant = create_azor_assistant()`

#### Aktualizacja `initialize_from_cli()`
- Zastąpić wszystkie wywołania `create_azor_assistant()` użyciem rejestru
- Dla istniejącej sesji: zmienić `ChatSession.load_from_file(assistant=assistant, session_id=cli_session_id)` na `ChatSession.load_from_file(cli_session_id)`
- Dla nowej sesji: użyć rejestru: `assistant = registry.get_assistant_by_id("azor")` zamiast `create_azor_assistant()`

#### Aktualizacja `remove_current_session_and_create_new()`
- Obecnie: `assistant = create_azor_assistant()` i `ChatSession(assistant=assistant)`
- Zmienić na: `from assistant.registry import get_assistant_by_id` i `assistant = get_assistant_by_id("azor")`
- Przekazać `assistant_id="azor"` do konstruktora `ChatSession`

### 6. Nowa Komenda: `/assistant` (`src/command_handler.py`)

#### Funkcjonalność
- `/assistant` - wyświetla listę dostępnych asystentów i aktualnie wybranego
- `/assistant <id>` - przełącza na asystenta o podanym ID

#### Implementacja

**W `handle_command()`**:
- Dodać `/assistant` do `VALID_SLASH_COMMANDS`
- Dodać obsługę w głównej funkcji `handle_command()`:

```python
elif command == '/assistant':
    if len(parts) == 1:
        # Wyświetl listę dostępnych asystentów
        from commands.assistant_list import list_assistants_command
        list_assistants_command(manager.get_current_session())
    elif len(parts) == 2:
        # Przełącz asystenta
        assistant_id = parts[1]
        from commands.assistant_switch import switch_assistant_command
        switch_assistant_command(manager.get_current_session(), assistant_id)
    else:
        console.print_error("Błąd: Użycie: /assistant [<ID>]")
```

**Nowy plik `src/commands/assistant_list.py`**:
- Wyświetla listę dostępnych asystentów
- Podświetla aktualnie wybranego

**Nowy plik `src/commands/assistant_switch.py`**:
- Waliduje ID asystenta (sprawdza czy istnieje w rejestrze)
- Wywołuje `session.switch_assistant(assistant_id)` (przekazuje ID, nie obiekt Assistant)
- Wyświetla komunikat potwierdzenia z nazwą asystenta

### 7. Aktualizacja CLI (`src/cli/console.py`)

#### `display_help()`
Dodać informację o nowej komendzie:
```python
print_help("  /assistant [<ID>]  - Wyświetla listę asystentów lub przełącza asystenta.")
```

#### Wyświetlanie aktualnego asystenta
- W promptcie lub w `display_help()` pokazywać aktualnie wybranego asystenta

### 8. Aktualizacja Prompt (`src/cli/prompt.py`)

#### Auto-uzupełnianie
Dodać `/assistant` do `SLASH_COMMANDS`:
```python
SLASH_COMMANDS = ('/exit', '/quit', '/switch', '/help', '/session', '/assistant', '/pdf', '/set', '/audio')
```

Dodać do `_commands_completer`:
```python
'/assistant': WordCompleter(['azor', 'perfectionist', 'businessman', 'optimist'], ignore_case=False)
```

**Uwaga**: `SLASH_COMMANDS` w `prompt.py` jest używane tylko do kolorowania w `SlashCommandLexer`, więc dodanie `/assistant` tam jest wystarczające.

## 📊 Przepływ Danych

### Tworzenie Nowej Sesji
1. Użytkownik uruchamia aplikację
2. `SessionManager.create_new_session()` wywołuje rejestr asystentów
3. Rejestr zwraca domyślnego asystenta ("azor")
4. `ChatSession` zapisuje `assistant_id` przy zapisie

### Ładowanie Sesji
1. `SessionManager.switch_to_session(session_id)` wywołuje `ChatSession.load_from_file(session_id)`
2. `ChatSession.load_from_file()` wywołuje `session_files.load_session_history(session_id)`
3. `session_files.load_session_history()` odczytuje `assistant_id` z JSON (lub zwraca `None` dla starych sesji)
4. `ChatSession.load_from_file()` używa rejestru: `assistant = registry.get_assistant_by_id(assistant_id or "azor")`
5. Tworzy `ChatSession` z odpowiednim asystentem
6. Sesja jest przywrócona z właściwym asystentem

### Zmiana Asystenta w Trakcie Sesji
1. Użytkownik wpisuje `/assistant perfectionist`
2. `command_handler` waliduje ID i wywołuje `session.switch_assistant("perfectionist")`
3. `switch_assistant()`:
   - Pobiera nowego asystenta z rejestru: `new_assistant = registry.get_assistant_by_id("perfectionist")`
   - Dodaje wpis do historii: `[SYSTEM: Zmiana asystenta z AZOR na PERFEKCJONISTA]`
   - Zmienia `self.assistant` i `self.assistant_id`
   - Reinicjalizuje sesję LLM z nowym system promptem
   - Zapisuje zmianę do pliku (z nowym `assistant_id`)

## 🔄 Kompatybilność Wsteczna

### Stare Sesje (bez `assistant_id`)
- Przy ładowaniu: `assistant_id` będzie `None`
- Automatycznie użyty zostanie domyślny asystent ("azor")
- Sesja będzie działać normalnie

### Migracja (opcjonalna)
- Można dodać skrypt migracyjny, który doda `assistant_id: "azor"` do wszystkich starych sesji

## ✅ Lista Zadań Implementacyjnych

### Faza 1: Podstawowa Infrastruktura
- [ ] Utworzyć `src/assistant/registry.py` z rejestrem asystentów
- [ ] Utworzyć `src/assistant/perfectionist.py`
- [ ] Utworzyć `src/assistant/businessman.py`
- [ ] Utworzyć `src/assistant/optimist.py`
- [ ] Zaktualizować `src/assistant/__init__.py` (eksport nowych funkcji)

### Faza 2: Persistencja Asystentów
- [ ] Rozszerzyć `src/files/session_files.py`:
  - [ ] `save_session_history()` - dodać parametr `assistant_id: str | None = None`
  - [ ] `load_session_history()` - zmienić zwracany tuple na `(history, title, assistant_id, error)`
- [ ] Zaktualizować `ChatSession`:
  - [ ] Dodać pole `assistant_id: str` w `__init__()`
  - [ ] Dodać metodę pomocniczą `_get_assistant_id_from_assistant() -> str`
  - [ ] Zaktualizować `save_to_file()` - przekazywać `self.assistant_id` do `save_session_history()`
  - [ ] Zaktualizować `load_from_file()` - zmienić sygnaturę (usunąć parametr `assistant`), użyć rejestru do tworzenia asystenta
  - [ ] Dodać metodę `switch_assistant(assistant_id: str)` - używa rejestru do pobrania asystenta

### Faza 3: Komendy i UI
- [ ] Utworzyć `src/commands/assistant_list.py`
- [ ] Utworzyć `src/commands/assistant_switch.py`
- [ ] Zaktualizować `src/command_handler.py` - dodać obsługę `/assistant`
- [ ] Zaktualizować `src/cli/console.py` - dodać informację o komendzie
- [ ] Zaktualizować `src/cli/prompt.py` - dodać auto-uzupełnianie

### Faza 4: Integracja z SessionManager
- [ ] Zaktualizować `SessionManager.create_new_session()` - zastąpić `create_azor_assistant()` użyciem rejestru
- [ ] Zaktualizować `SessionManager.switch_to_session()` - usunąć `create_azor_assistant()`, użyć `ChatSession.load_from_file()`
- [ ] Zaktualizować `SessionManager.initialize_from_cli()` - zastąpić wszystkie `create_azor_assistant()` użyciem rejestru
- [ ] Zaktualizować `SessionManager.remove_current_session_and_create_new()` - używać rejestru
- [ ] Przetestować cały przepływ

### Faza 5: Testy i Dokumentacja
- [ ] Przetestować zapis/odczyt sesji z różnymi asystentami
- [ ] Przetestować zmianę asystenta w trakcie sesji
- [ ] Przetestować kompatybilność wsteczną (stare sesje)
- [ ] Zaktualizować dokumentację

## 🎨 Przykłady Użycia

### Wyświetlenie listy asystentów
```
TY: /assistant
Dostępni asystenci:
  [*] azor          - Przyjazny asystent-pies
  [ ] perfectionist - Perfekcjonista (skrupulatny i dokładny)
  [ ] businessman   - Biznesmen (rzeczowy i krótki)
  [ ] optimist      - Optymista (wspierający i entuzjastyczny)

Aktualnie wybrany: azor
```

### Przełączenie asystenta
```
TY: /assistant perfectionist
--- Przełączono na asystenta: PERFEKCJONISTA ---
[SYSTEM: Zmiana asystenta z AZOR na PERFEKCJONISTA]

TY: Napisz mi krótkie podsumowanie
PERFEKCJONISTA: Dokonam szczegółowej analizy wszystkich dostępnych informacji, aby zapewnić kompleksowe i precyzyjne podsumowanie zawierające wszystkie istotne szczegóły...
```

## 📝 Notatki Techniczne

### Identyfikacja Asystenta
- Używamy `assistant_id` (string) jako identyfikatora w plikach
- `assistant.name` to nazwa wyświetlana (np. "AZOR", "PERFEKCJONISTA")
- Rejestr mapuje `assistant_id` → funkcję tworzącą → `Assistant` instance

### Historia Konwersacji
- Wpis o zmianie asystenta jest dodawany jako wiadomość systemowa od "model"
- Format: `[SYSTEM: Zmiana asystenta z X na Y]`
- Pozwala to modelowi na świadomość zmiany kontekstu w historii

### Reinicjalizacja Sesji LLM
- Przy zmianie asystenta konieczna jest reinicjalizacja `_llm_chat_session`
- Nowy system prompt jest ustawiany w `_initialize_llm_session()`
- Historia pozostaje zachowana, tylko system prompt się zmienia

