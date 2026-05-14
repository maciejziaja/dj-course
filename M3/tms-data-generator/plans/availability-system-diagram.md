# Diagramy Systemu Dostępności

## 1. Diagram Relacji Encji (ERD)

```mermaid
erDiagram
    drivers ||--o{ driver_availability_periods : "ma"
    drivers ||--o{ order_assignments : "przypisany do"
    
    vehicles ||--o{ vehicle_availability_periods : "ma"
    vehicles ||--o{ order_assignments : "przypisany do"
    
    transportation_orders ||--o{ order_assignments : "ma"
    customers ||--o{ transportation_orders : "składa"
    
    drivers {
        int id PK
        string first_name
        string last_name
        string email
        string phone
        string contract_type
        string status
    }
    
    vehicles {
        int id PK
        string make
        string model
        int year
        decimal fuel_tank_capacity
    }
    
    customers {
        int id PK
        string first_name
        string last_name
        string email
        string phone
        string customer_type
        string address
    }
    
    driver_availability_periods {
        int id PK
        int driver_id FK
        string period_type
        timestamp start_time
        timestamp end_time
        string reason
        timestamp created_at
    }
    
    vehicle_availability_periods {
        int id PK
        int vehicle_id FK
        string period_type
        timestamp start_time
        timestamp end_time
        string reason
        timestamp created_at
    }
    
    transportation_orders {
        int id PK
        string order_number
        int customer_id FK
        string status
        decimal amount
        timestamp order_date
        date expected_delivery
        string shipping_address
        string shipping_city
        string shipping_state
        string shipping_zip_code
        string shipping_method
        string tracking_number
    }
    
    order_assignments {
        int id PK
        int order_id FK
        int driver_id FK "nullable"
        int vehicle_id FK "nullable"
        timestamp assigned_at
        timestamp start_time
        timestamp end_time "nullable"
        timestamp actual_start_time "nullable"
        timestamp actual_end_time "nullable"
        string status
    }
```

## 2. Diagram Przepływu Generowania Danych

```mermaid
flowchart TD
    Start([Start Generator]) --> Phase1[Phase 1: Niezależne Encje]
    
    Phase1 --> GenVehicles[Generuj Vehicles]
    Phase1 --> GenDrivers[Generuj Drivers]
    Phase1 --> GenCustomers[Generuj Customers]
    
    GenVehicles --> Wait1[Oczekiwanie na Phase 1]
    GenDrivers --> Wait1
    GenCustomers --> Wait1
    
    Wait1 --> Phase2[Phase 2: Availability Periods]
    
    Phase2 --> GenDriverAvail[Generuj Driver Availability Periods]
    Phase2 --> GenVehicleAvail[Generuj Vehicle Availability Periods]
    
    GenDriverAvail --> Wait2[Oczekiwanie na Phase 2]
    GenVehicleAvail --> Wait2
    
    Wait2 --> Phase3[Phase 3: Transportation Orders]
    Phase3 --> GenOrders[Generuj Transportation Orders]
    
    GenOrders --> Phase4[Phase 4: Order Items]
    Phase4 --> GenItems[Generuj Order Items]
    
    GenItems --> Phase5[Phase 5: Order Assignments]
    Phase5 --> GenAssignments[Generuj Order Assignments<br/>Sprawdź konflikty czasowe]
    
    GenAssignments --> Phase6[Phase 6: Timeline Events]
    Phase6 --> GenTimeline[Generuj Timeline Events]
    
    GenTimeline --> Phase7[Phase 7: Generuj SQL]
    Phase7 --> GenSQL[Generuj INSERT Statements]
    
    GenSQL --> WriteFile[Zapisz do pliku SQL]
    WriteFile --> End([Koniec])
    
    style Phase1 fill:#e1f5ff
    style Phase2 fill:#fff4e1
    style Phase3 fill:#e1f5ff
    style Phase4 fill:#e1f5ff
    style Phase5 fill:#ffe1f5
    style Phase6 fill:#e1f5ff
    style Phase7 fill:#e1ffe1
```

## 3. Diagram Sprawdzania Dostępności (Algorytm)

```mermaid
flowchart TD
    Start([Sprawdź Dostępność]) --> Input{Typ Zasobu?}
    
    Input -->|Kierowca| CheckDriverStatus[Sprawdź driver.status]
    Input -->|Pojazd| CheckVehicleStatus[Sprawdź vehicle.status]
    
    CheckDriverStatus --> DriverStatusOK{Status OK?<br/>ACTIVE/ON_ROUTE}
    CheckVehicleStatus --> VehicleStatusOK{Status OK?<br/>ACTIVE}
    
    DriverStatusOK -->|NIE| ReturnFalse1[Zwróć: NIEDOSTĘPNY]
    VehicleStatusOK -->|NIE| ReturnFalse2[Zwróć: NIEDOSTĘPNY]
    
    DriverStatusOK -->|TAK| CheckDriverPeriods[Sprawdź driver_availability_periods<br/>Czy jest UNAVAILABLE/LEAVE/SICK_LEAVE<br/>w przedziale czasowym?]
    VehicleStatusOK -->|TAK| CheckVehiclePeriods[Sprawdź vehicle_availability_periods<br/>Czy jest UNAVAILABLE/MAINTENANCE/REPAIR<br/>w przedziale czasowym?]
    
    CheckDriverPeriods --> DriverPeriodsOK{Okresy OK?}
    CheckVehiclePeriods --> VehiclePeriodsOK{Okresy OK?}
    
    DriverPeriodsOK -->|NIE| ReturnFalse3[Zwróć: NIEDOSTĘPNY]
    VehiclePeriodsOK -->|NIE| ReturnFalse4[Zwróć: NIEDOSTĘPNY]
    
    DriverPeriodsOK -->|TAK| CheckDriverAssignments[Sprawdź order_assignments<br/>Czy kierowca ma aktywne przypisania<br/>w przedziale czasowym?]
    VehiclePeriodsOK -->|TAK| CheckVehicleAssignments[Sprawdź order_assignments<br/>Czy pojazd ma aktywne przypisania<br/>w przedziale czasowym?]
    
    CheckDriverAssignments --> DriverAssignmentsOK{Przypisania OK?}
    CheckVehicleAssignments --> VehicleAssignmentsOK{Przypisania OK?}
    
    DriverAssignmentsOK -->|NIE| ReturnFalse5[Zwróć: NIEDOSTĘPNY]
    VehicleAssignmentsOK -->|NIE| ReturnFalse6[Zwróć: NIEDOSTĘPNY]
    
    DriverAssignmentsOK -->|TAK| ReturnTrue1[Zwróć: DOSTĘPNY]
    VehicleAssignmentsOK -->|TAK| ReturnTrue2[Zwróć: DOSTĘPNY]
    
    ReturnFalse1 --> End([Koniec])
    ReturnFalse2 --> End
    ReturnFalse3 --> End
    ReturnFalse4 --> End
    ReturnFalse5 --> End
    ReturnFalse6 --> End
    ReturnTrue1 --> End
    ReturnTrue2 --> End
    
    style Start fill:#e1f5ff
    style ReturnTrue1 fill:#e1ffe1
    style ReturnTrue2 fill:#e1ffe1
    style ReturnFalse1 fill:#ffe1e1
    style ReturnFalse2 fill:#ffe1e1
    style ReturnFalse3 fill:#ffe1e1
    style ReturnFalse4 fill:#ffe1e1
    style ReturnFalse5 fill:#ffe1e1
    style ReturnFalse6 fill:#ffe1e1
```

## 4. Diagram Zależności Generowania (Dependency Graph)

```mermaid
graph LR
    subgraph "Poziom 0 - Niezależne"
        V[vehicles]
        D[drivers]
        C[customers]
    end
    
    subgraph "Poziom 1 - Zależy od Poziomu 0"
        DAP[driver_availability_periods]
        VAP[vehicle_availability_periods]
        TO[transportation_orders]
    end
    
    subgraph "Poziom 2 - Zależy od Poziomu 1"
        OI[order_items]
        OA[order_assignments]
        OTE[order_timeline_events]
    end
    
    D --> DAP
    V --> VAP
    C --> TO
    
    TO --> OI
    TO --> OA
    TO --> OTE
    D --> OA
    V --> OA
    DAP --> OA
    VAP --> OA
    
    style V fill:#e1f5ff
    style D fill:#e1f5ff
    style C fill:#e1f5ff
    style DAP fill:#fff4e1
    style VAP fill:#fff4e1
    style TO fill:#fff4e1
    style OI fill:#ffe1f5
    style OA fill:#ffe1f5
    style OTE fill:#ffe1f5
```

## 5. Diagram Przypisywania Zasobów do Zamówień

```mermaid
sequenceDiagram
    participant G as Generator
    participant TO as Transportation Orders
    participant D as Drivers
    participant V as Vehicles
    participant DAP as Driver Availability
    participant VAP as Vehicle Availability
    participant OA as Order Assignments
    
    G->>TO: Pobierz zamówienia (status IN_TRANSIT+)
    loop Dla każdego zamówienia
        G->>D: Pobierz dostępnych kierowców
        D->>DAP: Sprawdź availability periods
        DAP-->>D: Lista dostępnych kierowców
        D-->>G: Lista dostępnych kierowców
        
        G->>V: Pobierz dostępne pojazdy
        V->>VAP: Sprawdź availability periods
        VAP-->>V: Lista dostępnych pojazdów
        V-->>G: Lista dostępnych pojazdów
        
        G->>OA: Sprawdź istniejące przypisania
        OA-->>G: Lista zajętych zasobów
        
        G->>G: Filtruj: usuń zajęte zasoby
        G->>G: Wybierz losowy kierowca + pojazd
        
        G->>OA: Utwórz order_assignment
        Note over OA: Blokuje zasoby w czasie
    end
```

## 6. Diagram Stanów Przypisania (State Machine)

```mermaid
stateDiagram-v2
    [*] --> PLANNED: Utworzenie przypisania
    
    PLANNED --> IN_PROGRESS: Rozpoczęcie realizacji<br/>(actual_start_time ustawiony)
    PLANNED --> CANCELLED: Anulowanie
    
    IN_PROGRESS --> COMPLETED: Zakończenie realizacji<br/>(actual_end_time ustawiony)
    IN_PROGRESS --> CANCELLED: Anulowanie w trakcie
    
    COMPLETED --> [*]
    CANCELLED --> [*]
    
    note right of PLANNED
        Zasób zablokowany
        ale jeszcze nie użyty
    end note
    
    note right of IN_PROGRESS
        Zasób w użyciu
        actual_start_time != NULL
    end note
    
    note right of COMPLETED
        Zasób zwolniony
        actual_end_time != NULL
    end note
```

## 7. Diagram Typów Okresów Dostępności

```mermaid
graph TD
    subgraph "Driver Availability Periods"
        D_AVAILABLE[AVAILABLE<br/>Okres dostępności]
        D_UNAVAILABLE[UNAVAILABLE<br/>Ogólna niedostępność]
        D_LEAVE[LEAVE<br/>Urlop]
        D_SICK[SICK_LEAVE<br/>Zwolnienie lekarskie]
    end
    
    subgraph "Vehicle Availability Periods"
        V_AVAILABLE[AVAILABLE<br/>Okres dostępności]
        V_UNAVAILABLE[UNAVAILABLE<br/>Ogólna niedostępność]
        V_MAINTENANCE[MAINTENANCE<br/>Konserwacja]
        V_REPAIR[REPAIR<br/>Naprawa]
    end
    
    subgraph "Order Assignment Status"
        OA_PLANNED[PLANNED<br/>Zaplanowane]
        OA_IN_PROGRESS[IN_PROGRESS<br/>W trakcie]
        OA_COMPLETED[COMPLETED<br/>Zakończone]
        OA_CANCELLED[CANCELLED<br/>Anulowane]
    end
    
    style D_AVAILABLE fill:#e1ffe1
    style D_UNAVAILABLE fill:#ffe1e1
    style D_LEAVE fill:#fff4e1
    style D_SICK fill:#ffe1e1
    
    style V_AVAILABLE fill:#e1ffe1
    style V_UNAVAILABLE fill:#ffe1e1
    style V_MAINTENANCE fill:#fff4e1
    style V_REPAIR fill:#ffe1e1
    
    style OA_PLANNED fill:#e1f5ff
    style OA_IN_PROGRESS fill:#fff4e1
    style OA_COMPLETED fill:#e1ffe1
    style OA_CANCELLED fill:#ffe1e1
```

## 8. Diagram Konfliktów Czasowych

```mermaid
gantt
    title Przykład Konfliktów Czasowych - Kierowca #1
    dateFormat YYYY-MM-DD
    section Dostępność
    Urlop (LEAVE)           :2024-07-15, 14d
    Dostępny                :2024-08-01, 30d
    section Przypisania
    Zamówienie #100         :2024-08-05, 3d
    Zamówienie #150         :2024-08-10, 2d
    section Konflikt
    Zamówienie #200 (BŁĄD) :crit, 2024-08-12, 2d
```

**Legenda:**
- Zielony: Okres dostępności
- Niebieski: Zaplanowane przypisania
- Czerwony: Konflikt (próba przypisania w czasie, gdy zasób jest zajęty)

---

## Uwagi do Diagramów

1. **Diagram ERD** pokazuje wszystkie relacje między encjami, w tym nullable foreign keys w `order_assignments`.

2. **Diagram Przepływu Generowania** pokazuje fazy generowania danych z uwzględnieniem zależności.

3. **Diagram Sprawdzania Dostępności** ilustruje algorytm weryfikacji dostępności zasobu w trzech krokach:
   - Status bazowy
   - Okresy niedostępności
   - Aktywne przypisania

4. **Diagram Zależności** pokazuje, które encje mogą być generowane równolegle, a które wymagają sekwencyjnego przetwarzania.

5. **Diagram Sekwencji** pokazuje proces przypisywania zasobów do zamówień z uwzględnieniem sprawdzania dostępności.

6. **Diagram Stanów** pokazuje możliwe przejścia między statusami przypisania.

7. **Diagram Typów** wizualizuje wszystkie możliwe wartości enumów.

8. **Diagram Gantt** pokazuje przykład konfliktu czasowego - próba przypisania kierowcy do zamówienia w czasie, gdy jest już przypisany do innego.

