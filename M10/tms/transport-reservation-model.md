TMS · transport-reservation · model taktyczny

# Model transport-reservation

Rezerwacja przypisuje kierowcę, ciągnik i naczepę do planu załadunkowego na określone okno czasu. Model rozdziela dwa pytania o każdy zasób: czy się nadaje do tego ładunku i czy jest wolny w tym oknie. Każde z nich ma własną granicę spójności.

## Najważniejsze decyzje

1. Dwie granice spójności `ResourceCalendar` pilnuje, żeby zasób nie był w dwóch miejscach naraz. `TransportReservation` pilnuje kompletności przydziału i jego zgodności z wymaganiami ładunku.
2. Kalendarz w osobnym module Do kalendarza piszą trzy moduły: rezerwacje, kadry i flota. Dlatego mieszka w generycznym module `availability`, a nie w rezerwacji.
3. Uprawnienia to kwalifikowalność Wygasły ADR wyklucza z transportów ADR, ale nie blokuje kalendarza. Ważność sprawdzamy dla całego okna, na migawkach danych z `drivers`.
4. Fakt wygrywa z planem L4 i awaria wypierają rezerwację. Rezerwacja przechodzi w `INCOMPLETE` i trzyma pozostałe zasoby, a dyspozytor dostaje zadanie obsadzenia roli.
5. Wymagania to suma cech Kategoria ładunku, klasa ADR i żądanie TAPA od klienta są od siebie niezależne. Wymagane uprawnienia to suma zbiorów wyliczonych z każdej z tych cech.
6. Siodło to fakt floty Naczepa MEGA ma 3 m wysokości wnętrza i mieści się w limicie 4 m tylko z ciągnikiem LOW_DECK. Mapowanie naczepy na wymagany typ siodła przychodzi z `fleet`, rezerwacja tylko porównuje.

## Granice modułów

Linia ciągła to wywołanie synchroniczne, przerywana to zdarzenie. Kadry i flota piszą do kalendarza bezpośrednio, więc konflikt nieobecności z rezerwacją rozstrzyga się w jednym miejscu, w jednej transakcji.

```mermaid
flowchart TB
    LP["load-planning<br/>ładunek, ADR, masa, LDM<br/>typ naczepy, TAPA, data"]
    RP["route-planning<br/>czas trwania"]
    DR["drivers<br/>uprawnienia + ważność<br/>urlopy, L4"]
    FL["fleet<br/>siodło ciągnika<br/>naczepa: typ, LDM,<br/>ładowność, wymagane siodło"]

    subgraph TR["transport-reservation · CORE"]
        ACL{{"ACL"}}
        RES[["TransportReservation"]]
        PRJ[("DriverProfile<br/>TractorProfile<br/>TrailerProfile")]
        ACL -- "fabryka wymagań" --> RES
        ACL --> PRJ
        PRJ -- "migawka przy decyzji" --> RES
    end

    subgraph AV["availability · GENERIC"]
        CAL[["ResourceCalendar<br/>jeden na zasób"]]
    end

    EX["realizacja transportu"]

    LP -. "LoadingPlanReady<br/>LoadingPlanCancelled" .-> ACL
    RP -. "TransportDurationEstimated" .-> ACL
    DR -. "DriverQualificationsChanged" .-> ACL
    FL -. "TractorChanged<br/>TrailerChanged" .-> ACL

    RES -- "block / release" --> CAL
    DR -- "urlop: block<br/>L4: takeOver" --> CAL
    FL -- "serwis: block<br/>awaria: takeOver" --> CAL
    CAL -. "ResourceTakenOver" .-> RES

    RES -. "TransportReserved, …" .-> EX
    EX -. "TransportCompleted" .-> RES
```

## Agregaty i granice spójności

Dwa agregaty w dwóch modułach, bez referencji między sobą. Kalendarz zna tylko nieprzezroczystego właściciela blokady, a rezerwacja tylko identyfikatory zasobów i migawki faktów, na których oparła decyzję.

```mermaid
classDiagram
    direction TB

    namespace transport_reservation {
        class TransportReservation {
            <<Aggregate Root>>
            LoadingPlanId id
            TransportRequirements requirements
            Assignment driver
            Assignment tractor
            Assignment trailer
            ReservationStatus status
            reserve(driver, tractor, trailer)
            assign(role, profile)
            markLost(role, reason)
            changeWindow(window)
            cancel()
            complete()
        }
        class TransportRequirements {
            <<Value Object>>
            TimeWindow window
            CargoCategory category
            AdrClass adrClass
            bool tapaRequested
            TrailerType trailerType
            Mass mass
            LoadingMeters ldm
        }
        class Assignment {
            <<Value Object>>
            ResourceId resourceId
            DecisionBasis basis
        }
        class RequiredQualificationsPolicy {
            <<Policy>>
            required(requirements) Set~QualificationType~
        }
        class TrailerFitPolicy {
            <<Policy>>
            check(trailer, requirements) Violations
        }
        class DriverProfile {
            <<Projection>>
            DriverId id
            Set~Qualification~ qualifications
            covers(types, window) bool
        }
        class Qualification {
            <<Value Object>>
            QualificationType type
            Instant validUntil
        }
        class TractorProfile {
            <<Projection>>
            TractorId id
            FifthWheelType fifthWheel
        }
        class TrailerProfile {
            <<Projection>>
            TrailerId id
            TrailerType type
            Mass payload
            LoadingMeters ldm
            FifthWheelType requiredFifthWheel
        }
    }

    namespace availability {
        class ResourceCalendar {
            <<Aggregate Root>>
            ResourceId id
            List~Blockade~ blockades
            Version version
            block(owner, window)
            takeOver(owner, window)
            release(owner)
        }
        class Blockade {
            <<Value Object>>
            Owner owner
            TimeWindow window
        }
        class TimeWindow {
            <<Value Object>>
            Instant from
            Instant to
            overlaps(other) bool
            covers(other) bool
        }
    }

    TransportReservation *-- TransportRequirements
    TransportReservation *-- "0..3" Assignment
    TransportReservation ..> RequiredQualificationsPolicy : R9
    TransportReservation ..> TrailerFitPolicy : R7
    Assignment ..> DriverProfile : migawka
    Assignment ..> TractorProfile : migawka
    Assignment ..> TrailerProfile : migawka
    DriverProfile *-- Qualification
    ResourceCalendar *-- "0..*" Blockade
    Blockade --> TimeWindow

    note for TransportReservation "R4 tożsamość = plan załadunkowy<br>R5 RESERVED ⇒ trzy role obsadzone<br>R6 siodło ciągnika = wymagane przez naczepę<br>R7–R9 sprawdzane w reserve() i assign()"
    note for ResourceCalendar "R1 brak nakładających się blokad [od, do)<br>R3 block odrzuca konflikt, takeOver wypiera<br>owner jest nieprzezroczysty"
```

## Reguły i ich miejsce

Cztery rodzaje reguł. Strzałki przerywane łączą to, co świat może unieważnić po decyzji, z polityką, która przywraca zgodność.

```mermaid
flowchart LR
    subgraph EXT["Reguły cudze · u sąsiadów"]
        X1["drivers<br/>ważność uprawnień"]
        X2["fleet<br/>naczepa → wymagane siodło"]
        X3["drivers, fleet<br/>urlop, serwis: block<br/>L4, awaria: takeOver"]
    end
    subgraph INV["Niezmienniki · w transakcji"]
        I1["ResourceCalendar<br/>R1 brak nakładania się<br/>R3 block / takeOver"]
        I2["availability.block<br/>R2 trzy albo żadna"]
        I3["TransportReservation<br/>R4 jedna na plan<br/>R5 RESERVED ⇒ 3 role<br/>R6 zgodne siodło"]
    end
    subgraph VAL["Walidacje decyzji · na migawkach"]
        V1["TrailerFitPolicy<br/>R7 typ, masa, LDM"]
        V2["RequiredQualificationsPolicy<br/>R9 zawsze C+E i Kod 95<br/>żywność → Sanepid<br/>ADR → zaświadczenie ADR<br/>żądanie klienta → TAPA"]
        V3["DriverProfile.covers<br/>R8 ważne przez całe okno"]
    end
    subgraph REA["Polityki reakcji · po decyzji"]
        P1["ResourceTakenOver<br/>→ markLost"]
        P2["zmiana uprawnień<br/>→ rewalidacja"]
        P3["nowy czas trwania<br/>→ changeWindow"]
        P4["blisko startu<br/>bez RESERVED<br/>→ eskalacja"]
    end

    X1 --> V3
    X2 --> I3
    X3 --> I1
    V2 -- "wymagany zbiór" --> V3
    I1 -. "fakt wygrywa z planem" .-> P1
    V3 -. "świat unieważnił decyzję" .-> P2
    I2 -. "nowe okno" .-> P3
```

## Stan rezerwacji

Utrata jednej roli nie anuluje rezerwacji i nie zwalnia pozostałych zasobów. Anulowanie z każdego aktywnego stanu zwalnia wszystkie blokady.

```mermaid
stateDiagram-v2
    [*] --> UNASSIGNED : plan + czas trwania
    UNASSIGNED --> RESERVED : reserve(kierowca, ciągnik, naczepa)
    RESERVED --> INCOMPLETE : markLost(rola)
    INCOMPLETE --> RESERVED : assign(rola)
    RESERVED --> COMPLETED : TransportCompleted
    UNASSIGNED --> CANCELLED : cancel
    RESERVED --> CANCELLED : cancel
    INCOMPLETE --> CANCELLED : cancel
    COMPLETED --> [*]
    CANCELLED --> [*]

    note left of RESERVED
        R5 trzy role obsadzone
        assign: zamiana zasobu
        changeWindow: nowe okno
    end note
    note right of INCOMPLETE
        brakuje min. jednej roli
        reszta ról zablokowana
        markLost po: ResourceTakenOver,
        utracie uprawnień, konflikcie okna
    end note
```

## Rezerwacja krok po kroku

Reguły sprawdza agregat, bez wejścia-wyjścia. Trzy kalendarze blokujemy w jednej transakcji. Konflikt wersji jest ponawiany, konflikt okien trafia do dyspozytora jako błąd.

```mermaid
sequenceDiagram
    autonumber
    actor D as Dyspozytor
    participant APP as transport-reservation<br/>serwis aplikacyjny
    participant TR as TransportReservation
    participant AV as availability
    participant CAL as ResourceCalendar ×3

    D->>APP: kandydaci(LP-17)
    APP-->>D: read model: przechodzą polityki i są wolni w oknie
    Note over D,APP: read model może być nieświeży, prawdę rozstrzyga komenda
    D->>APP: ReserveTransport(LP-17, kierowca, ciągnik, naczepa)
    APP->>APP: wczytaj rezerwację i projekcje
    APP->>TR: reserve(migawki trzech zasobów)
    TR->>TR: R5–R9 bez I/O, zbiera wszystkie naruszenia
    alt reguły naruszone
        TR-->>APP: lista naruszeń
        APP-->>D: błąd, np. ADR wygasa przed końcem okna
    else reguły spełnione
        APP->>AV: block(owner = LP-17, [kierowca, ciągnik, naczepa], okno)
        Note over AV,CAL: jedna transakcja, trzy albo żadna (R2)
        AV->>CAL: block × 3 (R1)
        alt nakładające się okna
            AV-->>APP: Conflict(kierowca, LP-9)
            APP-->>D: błąd: kierowca zajęty przez LP-9
        else konflikt wersji (optimistic lock)
            AV-->>APP: ConcurrentModification
            APP->>APP: ponów komendę od kroku 4
        else wszystko wolne
            AV-->>APP: OK
            APP->>APP: zapisz rezerwację, publikuj TransportReserved
            APP-->>D: zarezerwowano
        end
    end
```

## Utrata zasobu po rezerwacji

L4 kierowcy wypiera rezerwację. Ciągnik i naczepa czekają zablokowane, a nowy kierowca przechodzi przez te same reguły co przy pierwszej rezerwacji.

```mermaid
sequenceDiagram
    autonumber
    participant HR as drivers (kadry)
    participant AV as availability
    participant APP as transport-reservation<br/>serwis aplikacyjny
    participant TR as TransportReservation
    actor D as Dyspozytor

    HR->>AV: takeOver(owner = L4-123, kierowca, okno L4)
    Note over AV: kalendarz kierowcy usuwa blokadę LP-17 (R3)
    AV--)APP: ResourceTakenOver(kierowca, poprzednio LP-17)
    APP->>TR: markLost(DRIVER, L4)
    Note over TR: RESERVED → INCOMPLETE<br/>ciągnik i naczepa nadal zablokowane
    APP--)D: ReservationBecameIncomplete → zadanie „obsadź kierowcę”
    D->>APP: AssignRole(LP-17, DRIVER, nowy kierowca)
    APP->>TR: assign(DRIVER, migawka) — R8, R9
    APP->>AV: block(owner = LP-17, [nowy kierowca], okno)
    AV-->>APP: OK
    Note over TR: INCOMPLETE → RESERVED
    APP--)D: RoleReassigned
```

## Otwarte pytania do eksperta

- Czy system ma pilnować czasu pracy kierowcy, czyli odpoczynku między transportami i limitów tygodniowych? Jeśli tak, to niezmiennik obejmujący wiele rezerwacji jednego kierowcy, więc kalendarz kierowcy dostaje własne reguły.
- Czy ciągnik LOW_DECK może ciągnąć zwykłą naczepę? Zmienia to tylko dane z `fleet` i porównanie w R6.
- Kto wygrywa: zatwierdzony urlop czy wcześniejsza rezerwacja? To wybór między `block` a `takeOver` po stronie kadr.
- Czy czas z route-planning obejmuje dojazd na załadunek i odpoczynki? Jeśli nie, okno blokady musi być szersze niż okno transportu.