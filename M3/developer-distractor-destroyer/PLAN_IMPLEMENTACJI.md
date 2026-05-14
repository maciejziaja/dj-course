# Plan Implementacji - Statystyki z Podziałem Czasowym

## Wybrana Struktura Danych (optymalna dla czytania)

### Nowa struktura `timeData`:
```javascript
timeData: {
  "example.com": {
    "2024-01-15": 120,  // sekundy spędzone w tym dniu
    "2024-01-16": 300,
    "2024-01-17": 45,
    ...
  },
  "another.com": {
    "2024-01-15": 60,
    ...
  }
}
```

### Nowa struktura `gotchaStats`:
```javascript
gotchaStats: {
  "example.com": {
    "2024-01-15": 5,  // liczba prób w tym dniu
    "2024-01-16": 3,
    ...
  }
}
```

**Zalety tej struktury:**
- ✅ Szybki dostęp do danych po dacie (klucz = data)
- ✅ Łatwe filtrowanie zakresu dat (porównanie stringów dat)
- ✅ Łatwe sumowanie danych z wielu dni
- ✅ Nie trzeba iterować przez wszystkie wpisy
- ✅ Minimalna ilość danych w pamięci

---

## ETAP 1: Zmiana Struktury Danych + Migracja

### 1.1. Aktualizacja `background.js`
- [ ] Zmienić funkcję `updateTime()` aby zapisywała dane z datą (format: "YYYY-MM-DD")
- [ ] Zamiast `timeData[domain] = (timeData[domain] || 0) + 1` użyć:
  ```javascript
  const today = new Date().toISOString().split('T')[0];
  if (!timeData[domain]) timeData[domain] = {};
  timeData[domain][today] = (timeData[domain][today] || 0) + 1;
  ```

### 1.2. Aktualizacja `gotchaStats` w `background.js`
- [ ] Zmienić zapisywanie `gotchaStats` aby używało struktury z datami
- [ ] Zaktualizować w funkcji `monitorIfBlocked()` i `tabs.onUpdated`

### 1.3. Funkcja migracji danych
- [ ] Utworzyć funkcję `migrateOldData()` w `background.js`
- [ ] Funkcja powinna:
  - Wykryć starą strukturę danych
  - Przekonwertować na nową strukturę
  - Użyć daty instalacji rozszerzenia lub dzisiejszej daty jako daty migracji
  - Zachować wszystkie istniejące dane

### 1.4. Testy migracji
- [ ] Sprawdzić czy migracja działa poprawnie
- [ ] Upewnić się że nie tracimy danych

---

## ETAP 2: Filtry Okresów + Kalendarz + Logika Filtrowania

### 2.1. Aktualizacja UI w `stats.html`
- [ ] Dodać zakładki (tabs) dla okresów:
  - "Ostatni tydzień" (domyślna)
  - "Ostatni miesiąc"
  - "Wszystkie dane"
  - "Własny zakres" (pokazuje kalendarz)
- [ ] Dodać sekcję z kalendarzem (ukryta domyślnie, widoczna przy "Własny zakres")
- [ ] Dodać przyciski Import/Export

### 2.2. Funkcje pomocnicze w `stats.js`
- [ ] `getDateRange(period)` - zwraca zakres dat dla danego okresu
- [ ] `getWeekRange(date)` - zwraca zakres tygodnia (pon-ndz) dla danej daty
- [ ] `filterDataByDateRange(data, startDate, endDate)` - filtruje dane po zakresie dat
- [ ] `aggregateWeeklyData(data, startDate, endDate)` - sumuje dane tygodniowo
- [ ] `formatDate(date)` - formatuje datę do "YYYY-MM-DD"

### 2.3. Aktualizacja funkcji `updateStats()` w `stats.js`
- [ ] Dodać parametr okresu filtrowania
- [ ] Filtrować dane przed wyświetleniem
- [ ] Dla statystyk tygodniowych - grupować dane po tygodniach
- [ ] Aktualizować wykresy z przefiltrowanymi danymi

### 2.4. Obsługa zakładek i kalendarza
- [ ] Event listenery dla zakładek
- [ ] Integracja kalendarza (można użyć HTML5 `<input type="date">`)
- [ ] Walidacja zakresu dat (data końcowa >= data początkowa)

### 2.5. Wyświetlanie statystyk tygodniowych
- [ ] Dla widoku tygodniowego grupować dane po tygodniach
- [ ] Format: "Tydzień 1-7 stycznia 2024" lub "2024-W01"
- [ ] Sumować wszystkie dni z danego tygodnia

---

## ETAP 3: Import/Export JSON z Walidacją

### 3.1. Funkcja Export w `stats.js`
- [ ] `exportStats(period)` - eksportuje dane z wybranego okresu
- [ ] Format JSON:
  ```json
  {
    "exportDate": "2024-01-15T12:00:00Z",
    "period": {
      "start": "2024-01-08",
      "end": "2024-01-15"
    },
    "timeData": { ... },
    "gotchaStats": { ... }
  }
  ```
- [ ] Pobieranie pliku przez `downloadJSON()`

### 3.2. Funkcja Import w `stats.js`
- [ ] `importStats(file)` - importuje dane z pliku JSON
- [ ] Walidacja struktury:
  - [ ] Sprawdzić czy plik jest poprawnym JSON
  - [ ] Sprawdzić czy zawiera `timeData` i/lub `gotchaStats`
  - [ ] Sprawdzić strukturę danych (czy klucze to daty w formacie "YYYY-MM-DD")
  - [ ] Sprawdzić czy wartości są liczbami
- [ ] Po walidacji: nadpisać istniejące dane
- [ ] Pokazać komunikat o sukcesie/błędzie

### 3.3. UI dla Import/Export
- [ ] Przycisk "📥 Export" - pobiera plik JSON
- [ ] Przycisk "📤 Import" - otwiera dialog wyboru pliku
- [ ] Komunikaty o statusie operacji (sukces/błąd)

### 3.4. Obsługa błędów
- [ ] Walidacja przed importem
- [ ] Komunikaty błędów dla użytkownika
- [ ] Rollback w przypadku błędu (nie nadpisywać danych jeśli import się nie powiódł)

---

## Szczegóły Techniczne

### Format daty
- Używamy formatu ISO: `"YYYY-MM-DD"` (np. "2024-01-15")
- Ułatwia sortowanie i porównywanie

### Tydzień
- Tydzień zaczyna się w poniedziałek, kończy w niedzielę
- Funkcja `getWeekRange()` zwraca `{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }`

### Kompatybilność wsteczna
- Migracja automatyczna przy pierwszym uruchomieniu po aktualizacji
- Stare dane zostaną przypisane do daty migracji

### Wydajność
- Filtrowanie odbywa się w pamięci (dane są małe)
- Nie ma potrzeby optymalizacji dla większych zbiorów danych

---

## Kolejność Implementacji

1. **ETAP 1** - Fundament (struktura danych)
2. **ETAP 2** - Funkcjonalność (filtry i wyświetlanie)
3. **ETAP 3** - Eksport/Import (dodatkowe funkcje)

Każdy etap powinien być testowany przed przejściem do następnego.

