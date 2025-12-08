## Cele funkcjonalności: Tytuły sesji

- **Czytelność**: każda sesja ma zwięzły, opisowy tytuł (~60 znaków).
- **Nawigacja**: `/session list` pokazuje listę sesji z tytułami (fallback do `session_id`).
- **Ergonomia**: tytuł jest automatycznie generowany gdy brakuje go w logu sesji, ale użytkownik może go w każdej chwili nadpisać.
- **Przejrzystość**: użytkownik może sprawdzić aktualny tytuł bieżącej sesji.

---

## Zakres funkcjonalny

- **Auto-tytuł (LLM)**:
  - Gdy brakuje tytułu w logu sesji (`title` jest `None`), generujemy tytuł przy użyciu LLM.
  - Tytuł jest:
    - zwięzły (max 60 znaków, ucinany z wielokropkiem),
    - opisowy, odzwierciedla temat sesji,
    - w języku rozmowy (LLM sam wybiera).
  - Tytuł zapisywany jest w pliku sesji `~/.azor/<SESSION-ID>-log.json` w polu `title`.

- **Komendy użytkownika**:
  - `/session title`
    - Wyświetla aktualny tytuł bieżącej sesji (lub komunikat, że brak tytułu).
  - `/session rename NEW_TITLE`
    - Ustawia tytuł bieżącej sesji na `NEW_TITLE` (po przycięciu do 60 znaków).
    - Nadpisuje tytuł wygenerowany automatycznie.
  - `/session list`
    - Wyświetla listę sesji z kolumną "Tytuł".
    - Fallback: jeśli `title` jest puste/brak, pokazujemy `(<SESSION-ID>)` lub skróconą wersję ID.

---

## Zmiany w modelu danych

### Struktura pliku `~/.azor/<SESSION-ID>-log.json`

Aktualny (uproszczony) model:

- `session_id: str`
- `assistant_name: str`
- `model_name: str`
- `created_at: str`
- `updated_at: str`
- `system_prompt: str`
- `history: list[...]`

Planowana rozszerzona struktura:

- `session_id: str`
- `assistant_name: str`
- `model_name: str`
- `created_at: str`
- `updated_at: str`
- `system_prompt: str`
- `title: str | null`  ← **NOWE POLE**
- `history: list[...]`

Założenia:

- Pole `title` może być:
  - `null`/brak – przed wygenerowaniem tytułu lub dla starych sesji.
  - `str` – obecny tytuł (auto lub ręcznie ustawiony).
- Wsteczna kompatybilność:
  - Loader sesji traktuje brak `title` jako `None`.
  - `/session list` i `/session title` obsługują obie sytuacje.

---

## Logika generowania tytułu

### Moment generacji

- Po wywołaniu `ChatSession.send_message()`:
  - Jeśli `title` jest pusty (`None` / brak),
  - Wówczas wywołujemy dodatkowe zapytanie do LLM, które generuje tytuł na podstawie aktualnej historii rozmowy.

### Parametry wejściowe do LLM

- Wejście do promptu tytułowego:
  - **System prompt pomocniczy**: "Na podstawie poniższej historii rozmowy wygeneruj krótki, opisowy tytuł (max 60 znaków)..."
  - Fragment historii:
    - Aktualna historia rozmowy (wszystkie tury dostępne w momencie generowania).

- Oczekiwany output:
  - Krótki tekst (jedna linia, bez znaków nowej linii, bez cudzysłowów).
  - Jeśli wynik jest dłuższy niż 60 znaków – lokalnie przycinamy i dodajemy `...`.

### Walidacja i warunki brzegowe

- **Walidacja wygenerowanego tytułu**:
  - Tytuł jest zapisywany tylko jeśli:
    - nie jest pusty,
    - ma co najmniej 3 znaki (po usunięciu białych znaków z początku i końca).
  - Jeśli tytuł nie przechodzi walidacji:
    - nie zapisujemy go (`title` pozostaje `None`),
    - przy kolejnej turze rozmowy (gdy `title` jest nadal `None`) ponownie próbujemy wygenerować tytuł.

- **Błędy generowania tytułu**:
  - Jeśli generowanie tytułu nie powiedzie się (błąd sieci, walidacji, timeout):
    - nie przerywamy rozmowy z użytkownikiem,
    - zostawiamy `title = None`,
    - przy kolejnej turze rozmowy ponownie próbujemy wygenerować tytuł.

---

## Zachowanie komend CLI

### `/session list`

- Nowe zachowanie:
  - Kolumna "Tytuł":
    - jeśli `title` istnieje → pokazujemy tytuł,
    - jeśli `title` brak → pokazujemy skrócony `session_id` (np. pierwsze 8 znaków UUID).
  - UI:
    - szerokość kolumny tytułu: ~60 znaków.

### `/session title`

- Funkcjonalność:
  - Pobiera aktualną sesję z `SessionManager`.
  - Wyświetla:
    - `Tytuł bieżącej sesji: "<title>"` – jeśli istnieje,
    - `Ta sesja nie ma jeszcze tytułu (ID: <SESSION-ID>).` – jeśli brak.
- Bez modyfikacji stanu – tylko odczyt.

### `/session rename NEW_TITLE`

- Funkcjonalność:
  - Aktualizuje pole `title` bieżącej sesji na wartość `NEW_TITLE`:
    - usuwamy otaczające cudzysłowy (jeśli występują),
    - przycinamy do 60 znaków.
  - Zapisujemy nowy tytuł do pliku sesji (`save_to_file`).
  - Komunikat zwrotny:
    - `Zmieniono tytuł sesji na: "<title>"`.

- Walidacja:
  - Jeśli `NEW_TITLE` jest pusty (po usunięciu białych znaków) → błąd i brak zmian.
  - Jeśli `NEW_TITLE` ma mniej niż 3 znaki (po usunięciu białych znaków) → błąd i brak zmian.

---

## Miejsca w kodzie do modyfikacji (wysoki poziom)

> Uwaga: na tym etapie projektowym tylko identyfikujemy miejsca, bez implementacji.

- **`files/session_files.py`**:
  - Rozszerzenie formatu JSON o pole `title`.
  - Obsługa wczytywania/zapisu `title` (wraz z wsteczną kompatybilnością).

- **`session/chat_session.py`**:
  - Przechowywanie `title` jako pola `ChatSession` (np. `self._title`).
  - Aktualizacja tytułu:
    - metoda typu `set_title(...)`,
    - integracja z `save_to_file`.
  - Hook w `send_message`:
    - miejsce, w którym po każdej odpowiedzi modelu sprawdzamy czy `title` jest `None` i jeśli tak, wykonujemy auto-tytułowanie.

- **`session/session_manager.py`**:
  - Brak zmian wymaganych (tytuł jest częścią `ChatSession`).

- **`commands/session_list.py`**:
  - Dodanie kolumny "Tytuł" i fallbacku do `session_id`.

- **Nowe / rozszerzone komendy**:
  - `commands/session_title.py` (nowy plik) lub dodanie do istniejącego modułu:
    - implementacja `/session title`.
  - Rozszerzenie parsera podkomend `/session` o `rename`:
    - `handle_session_subcommand("title", ...)`,
    - `handle_session_subcommand("rename", ...)`.

- **Warstwa LLM / auto-tytułowanie**:
  - Nowy moduł `llm/title_generation.py`:
    - funkcja `generate_title_from_history(llm_client, history)` korzystająca z aktualnego klienta,
    - walidacja wygenerowanego tytułu (min. 3 znaki, nie pusty).

---

## Edge cases

- **Wielokrotne wywołania auto-tytułowania**:
  - Auto-tytuł jest wykonywany tylko gdy `title` jest `None`.
  - Po ręcznym `rename` auto-tytuł już nigdy nie nadpisuje tytułu (bo `title` nie jest `None`).
  - Jeśli wygenerowany tytuł nie przejdzie walidacji, `title` pozostaje `None` i przy kolejnej turze ponownie próbujemy wygenerować tytuł.

- **Stare sesje bez pola `title`**:
  - Loader sesji traktuje brak `title` jako `None`.
  - `/session list` i `/session title` działają poprawnie z fallbackiem do `session_id`.
  - Nie wymuszamy masowej migracji – tytuły pojawiają się dla nowych sesji lub przy ręcznym ustawieniu.