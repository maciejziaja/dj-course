# Podsumowanie Projektu: System Dostępności Kierowców i Pojazdów

## 📋 Przegląd Koncepcji

### Cel
Rozbudowa systemu `tms-data-generator` o funkcjonalność śledzenia dostępności kierowców i pojazdów, umożliwiającą:
- Planowanie przypisań zasobów do zamówień transportowych
- Śledzenie okresów niedostępności (urlopy, konserwacje)
- Zarządzanie konfliktami czasowymi
- Generowanie realistycznych danych testowych

---

## 🏗️ Architektura Rozwiązania

### Nowe Encje (3 tabele)

1. **`driver_availability_periods`**
   - Śledzi okresy dostępności/niedostępności kierowców
   - Typy: AVAILABLE, UNAVAILABLE, LEAVE, SICK_LEAVE
   - Okresy czasowe z możliwością otwartych końców (end_time = NULL)

2. **`vehicle_availability_periods`**
   - Śledzi okresy dostępności/niedostępności pojazdów
   - Typy: AVAILABLE, UNAVAILABLE, MAINTENANCE, REPAIR
   - Okresy czasowe z możliwością otwartych końców

3. **`order_assignments`**
   - Łączy zamówienia z zasobami (kierowcy + pojazdy)
   - Śledzi planowane i rzeczywiste czasy realizacji
   - Statusy: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
   - Elastyczność: może być tylko kierowca, tylko pojazd, lub oba

### Relacje

```
drivers (1) ──< (N) driver_availability_periods
drivers (1) ──< (N) order_assignments

vehicles (1) ──< (N) vehicle_availability_periods
vehicles (1) ──< (N) order_assignments

transportation_orders (1) ──< (N) order_assignments
```

---

## 🔄 Przepływ Danych

### Generowanie (Generator → SQL)

**Kolejność faz:**
1. **Phase 1** (równolegle): vehicles, drivers, customers
2. **Phase 2** (równolegle): driver_availability_periods, vehicle_availability_periods
3. **Phase 3**: transportation_orders
4. **Phase 4**: order_items
5. **Phase 5**: order_assignments (z sprawdzaniem konfliktów)
6. **Phase 6**: timeline_events
7. **Phase 7**: generowanie SQL INSERT statements

### Użycie (Aplikacja TMS)

**Algorytm sprawdzania dostępności:**
1. Sprawdź status bazowy (drivers.status, vehicles.status)
2. Sprawdź okresy niedostępności (availability_periods)
3. Sprawdź aktywne przypisania (order_assignments)

---

## 📊 Kluczowe Decyzje Projektowe

### ✅ Zatwierdzone Założenia

1. **Dwupoziomowy model dostępności:**
   - Poziom 1: Status bazowy (w tabelach drivers/vehicles)
   - Poziom 2: Szczegółowe okresy (nowe tabele)

2. **Elastyczne przypisania:**
   - `order_assignments` może mieć tylko kierowcę, tylko pojazd, lub oba
   - Nullable foreign keys dla maksymalnej elastyczności

3. **Otwarte okresy:**
   - `end_time` może być NULL (okres "do odwołania")
   - Sprawdzanie tylko `start_time` dla otwartych okresów

4. **Brak nakładania się okresów:**
   - Jeden okres na raz dla danego zasobu i typu
   - Konflikty wykrywane podczas generowania

### ⚠️ Do Rozważenia

1. **Priorytety okresów:** Czy LEAVE powinien mieć wyższy priorytet niż AVAILABLE?
2. **Historia zmian:** Czy potrzebna osobna tabela audytu?
3. **Synchronizacja z timeline:** Czy order_assignments powinno być powiązane z timeline events?

---

## 📁 Struktura Plików

### Nowe Pliki
```
generator/
├── drivers/
│   └── availability.go          # Generowanie driver_availability_periods
├── vehicles/
│   └── availability.go          # Generowanie vehicle_availability_periods
└── transportation_orders/
    └── assignments.go           # Generowanie order_assignments
```

### Modyfikowane Pliki
```
generator/
├── drivers/model.go             # + DriverAvailabilityPeriod
├── vehicles/model.go            # + VehicleAvailabilityPeriod
├── transportation_orders/model.go # + OrderAssignment
└── generator.go                 # + nowe fazy generowania

schema/
└── create-tms-schema.sql        # + 3 nowe tabele DDL
```

---

## 🎯 Strategia Generowania Danych

### Driver Availability Periods
- **Urlopy:** 0-2 na kierowcę/rok, 1-2 tygodnie każdy
- **Choroba:** 0-1 na kierowcę/rok, 1-5 dni
- **Rozłożenie:** Losowe w ostatnim roku, bez nakładania się

### Vehicle Availability Periods
- **Konserwacja:** 2-4 na pojazd/rok, 1-3 dni każda
- **Naprawa:** 0-1 na pojazd/rok, 3-7 dni (rzadziej)
- **Rozłożenie:** Losowe w ostatnim roku

### Order Assignments
- **Tylko dla zamówień:** status IN_TRANSIT lub późniejszy
- **Sprawdzanie konfliktów:** Nie przypisuj tego samego zasobu do dwóch zamówień jednocześnie
- **Realistyczne czasy:** start_time = order_date + offset (0-2 dni), end_time = start_time + czas realizacji (1-5 dni)
- **Status zgodny z zamówieniem:** IN_TRANSIT → IN_PROGRESS, DELIVERED → COMPLETED

---

## 🔍 Reguły Biznesowe

### Walidacje
1. `start_time` < `end_time` (jeśli end_time nie NULL)
2. Brak nakładania się okresów dla tego samego zasobu i typu
3. Przynajmniej jeden z driver_id/vehicle_id w order_assignments
4. Brak konfliktów czasowych w przypisaniach

### Spójność
- Kierowca OFF_DUTY/SICK_LEAVE → brak aktywnych przypisań
- Pojazd w konserwacji → brak aktywnych przypisań
- Status zamówienia zgodny ze statusem przypisania

---

## 📈 Szacunki

### Zakres Zmian
- **Nowe pliki:** 3 (~700 linii)
- **Modyfikowane pliki:** 5 (~160 linii)
- **Nowe tabele:** 3
- **Nowe encje w modelu:** 3
- **Łącznie:** ~860 linii kodu

### Wydajność
- Generowanie availability periods: równolegle (Phase 2)
- Generowanie assignments: sekwencyjnie (wymaga sprawdzania konfliktów)
- Szacowany czas: +20-30% do całkowitego czasu generowania

---

## 📚 Dokumentacja

### Utworzone Dokumenty

1. **`availability-system-design.md`**
   - Szczegółowy projekt koncepcyjny
   - Model danych, reguły biznesowe, strategia generowania
   - Pytania i decyzje do podjęcia

2. **`availability-system-diagram.md`**
   - Diagramy Mermaid: ERD, przepływ danych, algorytmy
   - Diagramy sekwencji, stanów, zależności
   - Wizualizacja konfliktów czasowych

3. **`availability-system-summary.md`** (ten dokument)
   - Podsumowanie koncepcji
   - Kluczowe decyzje i założenia
   - Przegląd struktury i zakresu

---

## ✅ Następne Kroki

### Po Zatwierdzeniu Koncepcji

1. **Faza Implementacji:**
   - [ ] Utworzenie struktur DDL w `create-tms-schema.sql`
   - [ ] Rozszerzenie modeli Go o nowe encje
   - [ ] Implementacja generatorów availability periods
   - [ ] Implementacja generatora order_assignments z logiką konfliktów
   - [ ] Integracja z istniejącym generatorem

2. **Faza Testowania:**
   - [ ] Weryfikacja generowanych danych
   - [ ] Sprawdzenie braku konfliktów czasowych
   - [ ] Walidacja spójności danych
   - [ ] Test wydajności

3. **Faza Dokumentacji:**
   - [ ] Aktualizacja README
   - [ ] Komentarze w kodzie
   - [ ] Przykłady użycia

---

## 📝 Status

**Status:** ⏳ **PROJEKT KONCEPCYJNY - Oczekuje na Zatwierdzenie**

**Data utworzenia:** 2025-01-27

**Autor:** AI Assistant (Auto)

---

## 🔗 Powiązane Dokumenty

- [Szczegółowy Projekt](./availability-system-design.md)
- [Diagramy Mermaid](./availability-system-diagram.md)
- [Plan Implementacji Transportation Orders](./transportation-order-implementation.md)

