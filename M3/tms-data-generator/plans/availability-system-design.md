# Projekt Koncepcyjny: System Dostępności Kierowców i Pojazdów

## 1. Analiza Wymagań

### 1.1 Cel Systemu
System dostępności ma na celu śledzenie, kiedy kierowcy i pojazdy są dostępne do przypisania do zamówień transportowych. System musi obsługiwać:
- **Dostępność czasową** - określenie okresów dostępności
- **Statusy dostępności** - różne stany (dostępny, zajęty, w konserwacji, urlop)
- **Powiązania z zamówieniami** - śledzenie przypisań do konkretnych zamówień
- **Historię zmian** - możliwość odtworzenia stanu dostępności w przeszłości

### 1.2 Scenariusze Użycia

#### Scenariusz 1: Przypisanie Kierowcy do Zamówienia
1. System sprawdza dostępność kierowców w danym przedziale czasowym
2. Filtruje kierowców według statusu (ACTIVE, ON_ROUTE)
3. Sprawdza konflikty czasowe z istniejącymi przypisaniami
4. Przypisuje kierowcę do zamówienia
5. Aktualizuje dostępność kierowcy

#### Scenariusz 2: Planowanie Konserwacji Pojazdu
1. Administrator planuje konserwację pojazdu
2. System tworzy blokadę dostępności w określonym przedziale czasowym
3. Pojazd jest niedostępny podczas konserwacji
4. Po zakończeniu konserwacji pojazd wraca do dostępności

#### Scenariusz 3: Sprawdzenie Dostępności
1. System sprawdza dostępność kierowcy/pojazdu w czasie T
2. Bierze pod uwagę:
   - Zaplanowane blokady (urlop, konserwacja)
   - Aktywne przypisania do zamówień
   - Status bazowy (ACTIVE, OFF_DUTY, etc.)

---

## 2. Model Danych - Koncepcja

### 2.1 Filozofia Projektu

System dostępności opiera się na **dwóch poziomach informacji**:

1. **Poziom Statusu Bazowego** (w tabelach `drivers` i `vehicles`)
   - Status ogólny (ACTIVE, OFF_DUTY, SICK_LEAVE dla kierowców)
   - Informacja statyczna, która może być aktualizowana ręcznie

2. **Poziom Szczegółowej Dostępności** (nowe tabele)
   - Okresy dostępności/niedostępności
   - Przypisania do zamówień
   - Zaplanowane blokady (urlop, konserwacja)

### 2.2 Proponowane Encje

#### Encja 1: `driver_availability_periods`
Reprezentuje okresy dostępności/niedostępności kierowcy.

**Atrybuty:**
- `id` - unikalny identyfikator
- `driver_id` - FK do `drivers`
- `period_type` - typ okresu (AVAILABLE, UNAVAILABLE, LEAVE, SICK_LEAVE)
- `start_time` - początek okresu (TIMESTAMP)
- `end_time` - koniec okresu (TIMESTAMP, nullable - może być otwarty)
- `reason` - powód niedostępności (opcjonalny tekst)
- `created_at` - data utworzenia rekordu

**Cel:**
- Śledzenie zaplanowanych urlopów
- Śledzenie okresów choroby
- Definiowanie godzin pracy (jeśli różne od domyślnych)
- Blokady czasowe

#### Encja 2: `vehicle_availability_periods`
Reprezentuje okresy dostępności/niedostępności pojazdu.

**Atrybuty:**
- `id` - unikalny identyfikator
- `vehicle_id` - FK do `vehicles`
- `period_type` - typ okresu (AVAILABLE, UNAVAILABLE, MAINTENANCE, REPAIR)
- `start_time` - początek okresu (TIMESTAMP)
- `end_time` - koniec okresu (TIMESTAMP, nullable)
- `reason` - powód niedostępności (opcjonalny tekst)
- `created_at` - data utworzenia rekordu

**Cel:**
- Śledzenie konserwacji pojazdów
- Śledzenie napraw
- Planowanie niedostępności

#### Encja 3: `order_assignments`
Reprezentuje przypisania kierowców i pojazdów do zamówień transportowych.

**Atrybuty:**
- `id` - unikalny identyfikator
- `order_id` - FK do `transportation_orders`
- `driver_id` - FK do `drivers` (nullable - może być tylko pojazd)
- `vehicle_id` - FK do `vehicles` (nullable - może być tylko kierowca)
- `assigned_at` - data przypisania (TIMESTAMP)
- `start_time` - planowany początek realizacji (TIMESTAMP)
- `end_time` - planowany koniec realizacji (TIMESTAMP, nullable)
- `actual_start_time` - rzeczywisty początek (TIMESTAMP, nullable)
- `actual_end_time` - rzeczywisty koniec (TIMESTAMP, nullable)
- `status` - status przypisania (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED)

**Cel:**
- Łączenie zamówień z zasobami (kierowcy + pojazdy)
- Śledzenie rzeczywistego czasu realizacji
- Blokowanie zasobów podczas realizacji zamówienia

**Uwaga:** To przypisanie automatycznie oznacza, że kierowca/pojazd jest niedostępny w danym okresie.

---

## 3. Relacje i Zależności

### 3.1 Diagram Relacji

```
drivers (1) ──< (N) driver_availability_periods
drivers (1) ──< (N) order_assignments

vehicles (1) ──< (N) vehicle_availability_periods
vehicles (1) ──< (N) order_assignments

transportation_orders (1) ──< (N) order_assignments
```

### 3.2 Zależności Funkcjonalne

**Hierarchia generowania danych:**
1. **Poziom 0 (niezależne):** `drivers`, `vehicles`, `customers`
2. **Poziom 1 (zależy od poziomu 0):** 
   - `driver_availability_periods` (zależy od `drivers`)
   - `vehicle_availability_periods` (zależy od `vehicles`)
   - `transportation_orders` (zależy od `customers`)
3. **Poziom 2 (zależy od poziomu 1):**
   - `order_assignments` (zależy od `drivers`, `vehicles`, `transportation_orders`)

**Uwaga:** `order_assignments` może być generowane tylko po wygenerowaniu zamówień, kierowców i pojazdów.

---

## 4. Przepływ Informacji (Data Flow)

### 4.1 Kto Pulluje, Kto Pushuje?

#### Generowanie Danych (Generator → Baza Danych)
- **Generator pushuje** dane do pliku SQL
- Generator tworzy:
  - `driver_availability_periods` - pushuje okresy dostępności
  - `vehicle_availability_periods` - pushuje okresy dostępności
  - `order_assignments` - pushuje przypisania

#### Użycie Danych (Aplikacja TMS → Baza Danych)
- **Aplikacja pulluje** dane z bazy do sprawdzenia dostępności
- **Aplikacja pushuje** nowe przypisania i aktualizacje statusów

### 4.2 Algorytm Sprawdzania Dostępności

**Pseudokod:**
```
FUNCTION isAvailable(resource, startTime, endTime):
    // 1. Sprawdź status bazowy
    IF resource.status NOT IN (ACTIVE, ON_ROUTE):
        RETURN false
    
    // 2. Sprawdź okresy niedostępności
    unavailablePeriods = SELECT * FROM availability_periods 
        WHERE resource_id = resource.id 
        AND period_type = UNAVAILABLE
        AND (start_time, end_time) OVERLAPS (startTime, endTime)
    
    IF unavailablePeriods EXISTS:
        RETURN false
    
    // 3. Sprawdź aktywne przypisania
    activeAssignments = SELECT * FROM order_assignments
        WHERE (driver_id = resource.id OR vehicle_id = resource.id)
        AND status IN (PLANNED, IN_PROGRESS)
        AND (start_time, end_time) OVERLAPS (startTime, endTime)
    
    IF activeAssignments EXISTS:
        RETURN false
    
    RETURN true
```

### 4.3 Generowanie Realistycznych Danych

**Dla `driver_availability_periods`:**
- Generuj urlopy (1-2 tygodnie, losowo rozłożone w roku)
- Generuj okresy choroby (1-5 dni, rzadziej)
- Generuj niestandardowe godziny pracy (dla niektórych kierowców)

**Dla `vehicle_availability_periods`:**
- Generuj konserwacje (1-3 dni, co kilka miesięcy)
- Generuj naprawy (rzadziej, dłuższe okresy)

**Dla `order_assignments`:**
- Przypisz kierowców i pojazdy do zamówień (tylko dla zamówień w statusie IN_TRANSIT lub późniejszym)
- Uwzględnij konflikty czasowe (nie przypisuj tego samego zasobu do dwóch zamówień jednocześnie)
- Generuj realistyczne czasy realizacji (zależne od odległości, typu zamówienia)

---

## 5. Typy Okresów Dostępności

### 5.1 Dla Kierowców (`driver_availability_periods.period_type`)

| Typ | Opis | Przykład |
|-----|------|----------|
| `AVAILABLE` | Okres dostępności (np. niestandardowe godziny pracy) | Kierowca dostępny w weekendy |
| `UNAVAILABLE` | Ogólna niedostępność | Blokada administracyjna |
| `LEAVE` | Urlop | 2 tygodnie wakacji |
| `SICK_LEAVE` | Zwolnienie lekarskie | 3 dni choroby |

### 5.2 Dla Pojazdów (`vehicle_availability_periods.period_type`)

| Typ | Opis | Przykład |
|-----|------|----------|
| `AVAILABLE` | Okres dostępności | Pojazd dostępny w określonych godzinach |
| `UNAVAILABLE` | Ogólna niedostępność | Blokada administracyjna |
| `MAINTENANCE` | Konserwacja planowana | Przegląd roczny |
| `REPAIR` | Naprawa | Naprawa po wypadku |

### 5.3 Dla Przypisań (`order_assignments.status`)

| Status | Opis |
|--------|------|
| `PLANNED` | Zaplanowane przypisanie (przed rozpoczęciem) |
| `IN_PROGRESS` | W trakcie realizacji |
| `COMPLETED` | Zakończone |
| `CANCELLED` | Anulowane |

---

## 6. Reguły Biznesowe

### 6.1 Walidacje

1. **Okresy dostępności:**
   - `start_time` < `end_time` (jeśli `end_time` nie jest NULL)
   - Okresy nie mogą się nakładać dla tego samego zasobu (dla tego samego typu)

2. **Przypisania:**
   - Kierowca lub pojazd musi być przypisany (przynajmniej jedno)
   - `start_time` nie może być w przeszłości dla statusu PLANNED
   - `actual_start_time` i `actual_end_time` mogą być NULL dla statusu PLANNED

3. **Konflikty:**
   - Kierowca nie może być przypisany do dwóch zamówień jednocześnie
   - Pojazd nie może być przypisany do dwóch zamówień jednocześnie
   - Przypisanie nie może kolidować z okresem niedostępności

### 6.2 Spójność Danych

- Jeśli kierowca ma status `OFF_DUTY` lub `SICK_LEAVE`, nie powinien mieć aktywnych przypisań
- Jeśli pojazd jest w konserwacji, nie powinien mieć aktywnych przypisań
- Status zamówienia powinien być zgodny ze statusem przypisania:
  - `IN_TRANSIT` → przypisanie powinno być `IN_PROGRESS` lub `COMPLETED`
  - `DELIVERED` → przypisanie powinno być `COMPLETED`

---

## 7. Struktura SQL (DDL)

### 7.1 Tabela: `driver_availability_periods`

```sql
CREATE TABLE driver_availability_periods (
    id INT PRIMARY KEY,
    driver_id INT NOT NULL,
    period_type VARCHAR(20) NOT NULL,  -- AVAILABLE, UNAVAILABLE, LEAVE, SICK_LEAVE
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,                 -- NULL = otwarty okres
    reason VARCHAR(255),                -- Opcjonalny powód
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE INDEX idx_driver_availability_driver ON driver_availability_periods(driver_id);
CREATE INDEX idx_driver_availability_time ON driver_availability_periods(start_time, end_time);
CREATE INDEX idx_driver_availability_type ON driver_availability_periods(period_type);
```

### 7.2 Tabela: `vehicle_availability_periods`

```sql
CREATE TABLE vehicle_availability_periods (
    id INT PRIMARY KEY,
    vehicle_id INT NOT NULL,
    period_type VARCHAR(20) NOT NULL,  -- AVAILABLE, UNAVAILABLE, MAINTENANCE, REPAIR
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,                 -- NULL = otwarty okres
    reason VARCHAR(255),                -- Opcjonalny powód
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE INDEX idx_vehicle_availability_vehicle ON vehicle_availability_periods(vehicle_id);
CREATE INDEX idx_vehicle_availability_time ON vehicle_availability_periods(start_time, end_time);
CREATE INDEX idx_vehicle_availability_type ON vehicle_availability_periods(period_type);
```

### 7.3 Tabela: `order_assignments`

```sql
CREATE TABLE order_assignments (
    id INT PRIMARY KEY,
    order_id INT NOT NULL,
    driver_id INT,                      -- NULL jeśli tylko pojazd
    vehicle_id INT,                     -- NULL jeśli tylko kierowca
    assigned_at TIMESTAMP NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,                 -- NULL = nieznany koniec
    actual_start_time TIMESTAMP,        -- NULL = jeszcze nie rozpoczęte
    actual_end_time TIMESTAMP,          -- NULL = jeszcze nie zakończone
    status VARCHAR(20) NOT NULL,        -- PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
    FOREIGN KEY (order_id) REFERENCES transportation_orders(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    CHECK (driver_id IS NOT NULL OR vehicle_id IS NOT NULL)  -- Przynajmniej jedno musi być
);

CREATE INDEX idx_order_assignments_order ON order_assignments(order_id);
CREATE INDEX idx_order_assignments_driver ON order_assignments(driver_id);
CREATE INDEX idx_order_assignments_vehicle ON order_assignments(vehicle_id);
CREATE INDEX idx_order_assignments_time ON order_assignments(start_time, end_time);
CREATE INDEX idx_order_assignments_status ON order_assignments(status);
```

---

## 8. Model Go (Struktury)

### 8.1 Driver Availability

```go
package drivers

type AvailabilityPeriodType string

const (
    AvailablePeriod   AvailabilityPeriodType = "AVAILABLE"
    UnavailablePeriod AvailabilityPeriodType = "UNAVAILABLE"
    LeavePeriod       AvailabilityPeriodType = "LEAVE"
    SickLeavePeriod   AvailabilityPeriodType = "SICK_LEAVE"
)

type DriverAvailabilityPeriod struct {
    ID         int
    DriverID   int
    PeriodType AvailabilityPeriodType
    StartTime  time.Time
    EndTime    *time.Time  // Pointer, bo może być NULL
    Reason     string      // Opcjonalny
    CreatedAt  time.Time
}
```

### 8.2 Vehicle Availability

```go
package vehicles

type VehicleAvailabilityPeriodType string

const (
    AvailableVehiclePeriod   VehicleAvailabilityPeriodType = "AVAILABLE"
    UnavailableVehiclePeriod VehicleAvailabilityPeriodType = "UNAVAILABLE"
    MaintenancePeriod        VehicleAvailabilityPeriodType = "MAINTENANCE"
    RepairPeriod             VehicleAvailabilityPeriodType = "REPAIR"
)

type VehicleAvailabilityPeriod struct {
    ID         int
    VehicleID  int
    PeriodType VehicleAvailabilityPeriodType
    StartTime  time.Time
    EndTime    *time.Time
    Reason     string
    CreatedAt  time.Time
}
```

### 8.3 Order Assignments

```go
package transportation_orders

type AssignmentStatus string

const (
    AssignmentPlanned    AssignmentStatus = "PLANNED"
    AssignmentInProgress AssignmentStatus = "IN_PROGRESS"
    AssignmentCompleted  AssignmentStatus = "COMPLETED"
    AssignmentCancelled  AssignmentStatus = "CANCELLED"
)

type OrderAssignment struct {
    ID              int
    OrderID         int
    DriverID        *int       // Pointer, bo może być NULL
    VehicleID       *int       // Pointer, bo może być NULL
    AssignedAt      time.Time
    StartTime       time.Time
    EndTime         *time.Time
    ActualStartTime *time.Time
    ActualEndTime   *time.Time
    Status          AssignmentStatus
}
```

---

## 9. Strategia Generowania Danych

### 9.1 Driver Availability Periods

**Algorytm:**
1. Dla każdego kierowcy:
   - Generuj 0-2 urlopy w roku (1-2 tygodnie każdy)
   - Generuj 0-1 okres choroby (1-5 dni)
   - Losowo rozłóż w czasie (ostatni rok)
   - Upewnij się, że nie nakładają się

**Przykładowe dane:**
- Kierowca #1: urlop 2024-07-15 do 2024-07-29, choroba 2024-03-10 do 2024-03-12
- Kierowca #2: urlop 2024-08-01 do 2024-08-14

### 9.2 Vehicle Availability Periods

**Algorytm:**
1. Dla każdego pojazdu:
   - Generuj 2-4 konserwacje w roku (1-3 dni każda)
   - Generuj 0-1 naprawę (3-7 dni, rzadziej)
   - Losowo rozłóż w czasie

**Przykładowe dane:**
- Pojazd #1: konserwacja 2024-01-15 do 2024-01-17, konserwacja 2024-07-20 do 2024-07-22
- Pojazd #2: naprawa 2024-05-10 do 2024-05-15

### 9.3 Order Assignments

**Algorytm:**
1. Dla zamówień w statusie `IN_TRANSIT` lub późniejszym:
   - Wybierz losowego dostępnego kierowcę (sprawdź konflikty)
   - Wybierz losowy dostępny pojazd (sprawdź konflikty)
   - Ustaw `start_time` = data zamówienia + losowy offset (0-2 dni)
   - Ustaw `end_time` = `start_time` + losowy czas realizacji (1-5 dni)
   - Ustaw status zgodnie ze statusem zamówienia:
     - `IN_TRANSIT` → `IN_PROGRESS`
     - `DELIVERED` → `COMPLETED`
   - Jeśli `COMPLETED`, ustaw `actual_start_time` i `actual_end_time`

**Uwaga:** Musimy sprawdzać konflikty czasowe - nie przypisujemy tego samego zasobu do dwóch zamówień jednocześnie.

---

## 10. Integracja z Istniejącym Kodem

### 10.1 Modyfikacje w `generator/generator.go`

**Nowa kolejność generowania:**
1. Phase 1: Niezależne encje (vehicles, drivers, customers) - równolegle
2. Phase 2: Availability periods (driver_availability_periods, vehicle_availability_periods) - równolegle
3. Phase 3: Transportation orders (zależy od customers)
4. Phase 4: Order items
5. Phase 5: Order assignments (zależy od orders, drivers, vehicles, availability periods)
6. Phase 6: Timeline events

### 10.2 Nowe Pakiety

```
generator/
├── drivers/
│   ├── model.go                    # Rozszerzyć o DriverAvailabilityPeriod
│   ├── drivers.go                  # Istniejący
│   └── availability.go             # NOWY - generowanie availability periods
├── vehicles/
│   ├── model.go                    # Rozszerzyć o VehicleAvailabilityPeriod
│   ├── vehicles.go                 # Istniejący
│   └── availability.go             # NOWY - generowanie availability periods
└── transportation_orders/
    ├── model.go                    # Rozszerzyć o OrderAssignment
    ├── transportation_orders.go   # Istniejący
    ├── order_items.go              # Istniejący
    ├── timeline_events.go          # Istniejący
    └── assignments.go              # NOWY - generowanie order assignments
```

---

## 11. Pytania i Decyzje do Podjęcia

### 11.1 Pytania Koncepcyjne

1. **Czy okresy dostępności mogą się nakładać?**
   - Propozycja: NIE - jeden okres na raz dla danego typu
   - Alternatywa: TAK - ale z priorytetami (np. LEAVE > AVAILABLE)

2. **Czy przypisanie może być tylko kierowca lub tylko pojazd?**
   - Propozycja: TAK - elastyczność (np. tylko pojazd dla transportu bez kierowcy)
   - Alternatywa: NIE - zawsze para kierowca+pojazd

3. **Czy potrzebujemy osobnej tabeli dla historii zmian statusu?**
   - Propozycja: NIE - wystarczą availability_periods i order_assignments
   - Alternatywa: TAK - dla pełnego audytu

4. **Jak obsługiwać otwarte okresy (end_time = NULL)?**
   - Propozycja: Traktować jako "do odwołania" - sprawdzać tylko start_time
   - Alternatywa: Wymagać end_time zawsze

5. **Czy order_assignments powinno być powiązane z timeline events?**
   - Propozycja: NIE - timeline events są niezależne
   - Alternatywa: TAK - synchronizacja (np. ASSIGNED event)

### 11.2 Decyzje Techniczne

1. **Indeksy:**
   - Proponowane indeksy pokrywają najczęstsze zapytania (po resource_id, po czasie, po statusie)
   - Można dodać composite index na (resource_id, start_time, end_time) dla szybkiego sprawdzania nakładania się

2. **Typy danych:**
   - TIMESTAMP dla wszystkich dat/czasów
   - VARCHAR dla typów i statusów (można rozważyć ENUM w przyszłości)

3. **Nullable fields:**
   - `end_time` - nullable (otwarte okresy)
   - `driver_id` / `vehicle_id` w assignments - nullable (elastyczność)
   - `actual_start_time` / `actual_end_time` - nullable (dopóki nie rozpoczęte/zakończone)

---

## 12. Zalecenia Implementacyjne

### 12.1 Faza 1: Podstawowa Struktura
- Utworzenie tabel DDL
- Utworzenie modeli Go
- Podstawowe generowanie availability periods (bez sprawdzania konfliktów)

### 12.2 Faza 2: Przypisania
- Generowanie order_assignments
- Podstawowe sprawdzanie konfliktów czasowych
- Integracja z istniejącym generatorem

### 12.3 Faza 3: Realizm i Walidacja
- Zaawansowane sprawdzanie konfliktów
- Realistyczne rozłożenie czasowe
- Walidacja spójności danych

---

## 13. Szacowany Zakres Zmian

### 13.1 Nowe Pliki
- `generator/drivers/availability.go` (~200 linii)
- `generator/vehicles/availability.go` (~200 linii)
- `generator/transportation_orders/assignments.go` (~300 linii)

### 13.2 Modyfikowane Pliki
- `generator/drivers/model.go` (+30 linii)
- `generator/vehicles/model.go` (+30 linii)
- `generator/transportation_orders/model.go` (+40 linii)
- `generator/generator.go` (+50 linii)
- `schema/create-tms-schema.sql` (+60 linii)
- `generator/config/count.go` (+10 linii)

### 13.3 Łącznie
- **Nowe linie kodu:** ~920 linii
- **Nowe tabele:** 3
- **Nowe encje w modelu:** 3

---

## 14. Status: ⏳ Oczekuje na Zatwierdzenie

Proszę o przejrzenie projektu koncepcyjnego i potwierdzenie podejścia przed rozpoczęciem implementacji.

**Następne kroki po zatwierdzeniu:**
1. Utworzenie diagramu Mermaid z relacjami
2. Szczegółowy plan implementacji (podobny do transportation-order-implementation.md)
3. Rozpoczęcie implementacji

