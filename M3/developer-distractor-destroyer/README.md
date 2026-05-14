# Developer Distractor Destroyer (DDD) Chrome Extension

A productivity-focused Chrome extension that **blocks distracting websites** (with wildcard support) and **tracks your browsing time** with second-level accuracy. Features a beautiful UI, real-time updates, inactivity detection, and a motivational custom block page.

## Features

- **Website Blocking**
  - Block any site or domain (supports wildcards, e.g. `*.facebook.com`)
  - Toggle blocking on/off easily
  - Custom block page with productivity tips and motivational quotes

- **Time Tracking**
  - Tracks time spent on each website (active tab only)
  - Second-level precision, real-time updates
  - Excludes time when tab is inactive or browser is unfocused
  - Browsing analytics: see your top sites by time spent

- **User Interface**
  - Clean, modern popup UI
  - Easy configuration of blocked sites
  - Live session timer and per-site time stats
  - Clear all data with one click

- **Local Storage**
  - All data is stored locally (no external servers)

## Installation

1. **Download the Source**
   - Download or clone this repository.

2. **Load the Extension in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the folder containing these files

3. **Start Using**
   - The extension icon will appear in your toolbar.
   - Click to open the popup and configure your blocking/time tracking.

## Usage

### Blocking Websites

1. Open the extension popup.
2. Enter a domain (e.g. `facebook.com` or `*.reddit.com`) and click "Add".
3. Toggle "Block websites" on/off as needed.
4. Blocked sites show a custom motivational page.

### Time Tracking

- See time spent on the current site (live, updates every second).
- View your top 10 sites by time spent.
- Click "Clear All Data" to reset stats.

### Wildcard Examples

- `facebook.com` — blocks facebook.com and all its subpages
- `*.reddit.com` — blocks all Reddit subdomains (e.g. www.reddit.com, old.reddit.com)
- `youtube.com` — blocks YouTube

## File Structure

```
developer-distractor-destroyer/
│
├── manifest.json         # Chrome extension manifest (MV3)
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── background.js         # Background service worker (time tracking)
├── content.js            # Content script (activity detection)
├── blocked.html          # Custom block page
├── rules.json            # Declarative net request rules template
└── README.md             # This documentation
```

## Permissions

- `storage` — Store settings and time data locally
- `activeTab` — Detect the current active tab
- `declarativeNetRequest` — Block/redirect websites
- `tabs` — Listen for tab changes
- `host_permissions: ` — Needed to monitor and block all websites

## Privacy

All data is stored **locally** in your browser. No data is ever sent to any server.

## Productivity Tips (from the Block Page)

- Focus on one task at a time
- Use the Pomodoro Technique: work 25 min, rest 5 min
- Make a daily to-do list
- Take short breaks and deep breaths
- Move your body for mental clarity

## Testowanie i Rozwój (Testing & Development)

### Jak przetestować rozszerzenie

1. **Załaduj rozszerzenie w Chrome:**
   - Otwórz Chrome i przejdź do `chrome://extensions/`
   - Włącz "Tryb deweloperski" (przełącznik w prawym górnym rogu)
   - Kliknij "Załaduj rozpakowane" (Load unpacked)
   - Wybierz folder zawierający pliki rozszerzenia (`developer-distractor-destroyer`)

2. **Podstawowe testy funkcjonalności:**
   - **Test blokowania stron:**
     - Kliknij ikonę rozszerzenia w pasku narzędzi
     - Dodaj stronę do blokowania (np. `facebook.com`)
     - Włącz przełącznik "Block websites"
     - Spróbuj otworzyć zablokowaną stronę - powinna pojawić się strona blokująca
   
   - **Test śledzenia czasu:**
     - Otwórz dowolną stronę (nie zablokowaną)
     - Pozwól stronie być aktywną przez kilka sekund
     - Kliknij "📊 View Time Statistics" w popupie, aby zobaczyć statystyki

3. **Debugowanie:**
   - **Console logi w background script:**
     - W `chrome://extensions/` znajdź rozszerzenie
     - Kliknij "service worker" (lub "background page") aby otworzyć konsolę
     - Zobaczysz logi z `background.js`
   
   - **Console logi w popup:**
     - Kliknij prawym przyciskiem na ikonę rozszerzenia
     - Wybierz "Sprawdź elementy popup" (Inspect popup)
     - Otworzy się DevTools z konsolą dla popup.html
   
   - **Console logi na stronie blokującej:**
     - Otwórz zablokowaną stronę
     - Kliknij F12 lub prawym przyciskiem → "Zbadaj" (Inspect)
     - Zobaczysz konsolę dla `blocked.html`

### Jak rozwijać rozszerzenie

#### 1. **Struktura plików i ich rola:**

- **`manifest.json`** - Konfiguracja rozszerzenia (uprawnienia, pliki, wersja)
- **`popup.html` / `popup.js`** - Interfejs użytkownika (okienko po kliknięciu ikony)
- **`background.js`** - Service worker działający w tle (śledzenie czasu, blokowanie)
- **`blocked.html` / `blocked.js`** - Strona wyświetlana gdy strona jest zablokowana
- **`stats.html` / `stats.js`** - Strona ze statystykami czasu przeglądania

#### 2. **Proces wprowadzania zmian:**

**Krok 1: Edytuj pliki**
- Otwórz odpowiedni plik w edytorze
- Wprowadź zmiany w kodzie

**Krok 2: Przeładuj rozszerzenie**
- Przejdź do `chrome://extensions/`
- Kliknij ikonę odświeżania (🔄) przy rozszerzeniu
- **WAŻNE:** Po zmianach w `background.js` może być konieczne całkowite wyłączenie i ponowne włączenie rozszerzenia

**Krok 3: Przetestuj zmiany**
- Sprawdź czy zmiany działają poprawnie
- Użyj konsoli deweloperskiej do debugowania

#### 3. **Typowe zadania deweloperskie:**

**Dodanie nowej funkcjonalności:**
```javascript
// Przykład: Dodanie nowego przycisku w popup.html
<button id="newFeature">Nowa funkcja</button>

// W popup.js dodaj obsługę:
document.getElementById('newFeature').addEventListener('click', () => {
    // Twoja logika
});
```

**Modyfikacja logiki blokowania:**
- Edytuj funkcję `monitorIfBlocked()` w `background.js`
- Zmień logikę sprawdzania zablokowanych stron w `chrome.tabs.onUpdated`

**Zmiana wyglądu UI:**
- Edytuj style CSS w `<style>` tagu w `popup.html`
- Lub dodaj osobny plik CSS i zaimportuj w HTML

**Dodanie nowych uprawnień:**
- Jeśli potrzebujesz nowych uprawnień, dodaj je do `manifest.json` w sekcji `permissions`
- Przeładuj rozszerzenie i zaakceptuj nowe uprawnienia

#### 4. **Najlepsze praktyki:**

- **Zawsze testuj po zmianach** - Przeładuj rozszerzenie i sprawdź czy działa
- **Używaj console.log()** - Pomaga w debugowaniu, szczególnie w `background.js`
- **Sprawdzaj konsolę błędów** - Chrome pokazuje błędy w konsoli service workera
- **Zapisuj dane w chrome.storage** - Używaj `chrome.storage.local` do przechowywania danych
- **Obsługuj błędy** - Dodawaj try-catch tam gdzie to możliwe
- **Testuj na różnych stronach** - Niektóre strony mogą mieć specjalne zachowania

#### 5. **Częste problemy i rozwiązania:**

**Problem:** Zmiany nie są widoczne po przeładowaniu
- **Rozwiązanie:** Wyłącz i włącz rozszerzenie, lub zrestartuj Chrome

**Problem:** Service worker się zatrzymuje
- **Rozwiązanie:** Service worker w MV3 może się zatrzymać. Użyj `chrome.alarms` do okresowych zadań

**Problem:** Błędy w konsoli service workera
- **Rozwiązanie:** Sprawdź `chrome://extensions/` → kliknij "service worker" przy rozszerzeniu

**Problem:** Uprawnienia nie działają
- **Rozwiązanie:** Sprawdź `manifest.json` i upewnij się, że wszystkie potrzebne uprawnienia są dodane

#### 6. **Przydatne narzędzia:**

- **Chrome DevTools** - Do debugowania popup, content scripts, i stron
- **chrome://extensions/** - Zarządzanie rozszerzeniami
- **chrome.storage API** - Do przechowywania danych lokalnie
- **Chrome Extension API Documentation** - https://developer.chrome.com/docs/extensions/

#### 7. **Przykładowe ulepszenia do zaimplementowania:**

- Dodanie eksportu statystyk do pliku JSON/CSV
- Implementacja harmonogramu blokowania (np. blokuj tylko w określonych godzinach)
- Dodanie powiadomień gdy próbujesz wejść na zablokowaną stronę
- Integracja z systemem celów (np. maksymalny czas na stronie dziennie)
- Dodanie trybu "Focus mode" z automatycznym blokowaniem rozpraszaczy
- Eksport danych do chmury (opcjonalny, z zachowaniem prywatności)

## License

MIT License

**Stay focused, achieve more!**
