# PACT Contract Testing – TMS API

Testy kontraktowe (CDC) dla TMS API. Dwóch konsumentów, jeden provider:

| konsument | co konsumuje |
|---|---|
| `TmsFrontend` | `GET /customers`, `GET /transportation-orders?customer_id` |
| `CargoPlannerCli` | cały proces planowania ładunku – moduł **TMS/cargo-plans** |

## Wymagania

- Node.js 18+, Docker Compose (Pact Broker + TMS API + Postgres z głównego `docker-compose.yml` projektu TMS)

## Uruchomienie

```bash
# Infrastruktura (z katalogu głównego TMS)
docker compose up -d          # tms-api :3000, pact-broker :9292, tms-postgres :5433

# Testy (z katalogu pact/)
npm run test:consumer   # generuje kontrakty i publikuje je do brokera
npm run test:provider   # weryfikuje kontrakty na żywym API i publikuje wyniki
npm run test            # consumer + provider
```

Broker: http://localhost:9292

## Struktura

```
├── consumer/pact-test.ts    # testy konsumentów (TmsFrontend + CargoPlannerCli)
├── provider/verify-pact.ts  # weryfikacja providera (TmsApi) + provider states
└── pacts/                   # wygenerowane pliki pact
```

## Zmienne środowiskowe

| zmienna | domyślnie | do czego |
|---|---|---|
| `CONTRACT_VARIANT` | `v1` | która wersja kontraktu `GET /cargo-plans/{id}` ma zostać wygenerowana (`v1`/`v2`/`v3`) |
| `CONSUMER_VERSION` | `1.0.0`/`2.0.0`/`3.0.0` | wersja `CargoPlannerCli` publikowana do brokera |
| `PUBLISH` | – | `PUBLISH=false` generuje pakty bez wysyłania do brokera |
| `PROVIDER_VERSION` | `1.0.0` | wersja providera zapisywana przy weryfikacji |
| `VERIFY_CONSUMER_VERSION` | – | weryfikuj dokładnie tę wersję `CargoPlannerCli` zamiast „najnowszej na branchu” |
| `PACT_BROKER_URL` | `http://localhost:9292` | adres brokera |
| `PACT_TMS_DATABASE_URL` | `postgresql://admin:…@localhost:5433/tms` | baza, w której provider states zasiewają dane |

---

# CDC dla modułu cargo-plans

Konsumentem jest `CargoPlannerCli` – zwykły klient HTTP (klasa `CargoPlansClient`
w `consumer/pact-test.ts`), bez żadnej wiedzy o Pakcie. To on jest uruchamiany
w teście przeciwko mockowi, więc kontrakt jest **produktem ubocznym** tego, czego
klient naprawdę potrzebuje, a nie listą życzeń.

## Kontrakt: 3 scenariusze, 10 interakcji

**Scenariusz 1 – pełny proces planowania**

| # | żądanie | odpowiedź |
|---|---|---|
| 1 | `POST /cargo-plans` `{loadSpaceType: standard-curtainside}` | `201` `{ id }` |
| 2 | `POST /cargo-plans/{id}/cargo` `{epal1, GENERAL, 600 kg, 1200 mm}` | `204` |
| 3 | `GET /cargo-plans/{id}` | `200` + read model |
| 4 | `DELETE /cargo-plans/{id}/cargo/{unitId}` | `204` |
| 5 | `PUT /cargo-plans/{id}/load-space` `{loadSpaceType: mega}` | `204` |
| 6 | `POST /cargo-plans/{id}/finalize` | `204` |

**Scenariusz 2 – żywność nie jedzie z chemią**

| # | żądanie | odpowiedź |
|---|---|---|
| 7 | `POST /cargo-plans/{id}/cargo` `{h1, FOOD, …}` do planu, który wiezie już `CHEMICAL` | `409` `{ error }` |

Klient rozgałęzia się na **kodzie błędu**, więc to `409` jest przedmiotem kontraktu;
treść komunikatu dopasowywana jest tylko po typie.

**Scenariusz 3 – pozostałe odmowy**

| # | żądanie | odpowiedź |
|---|---|---|
| 8 | `POST /cargo-plans` `{loadSpaceType: flatbed}` | `400` |
| 9 | `POST /cargo-plans/{id}/finalize` dla pustego planu | `422` |
| 10 | `GET /cargo-plans/{nieznane-id}` | `404` |

## Provider states

Pact odtwarza każde nagrane żądanie **dosłownie i w izolacji** – `id` zwrócone przez
`POST /cargo-plans` nigdy nie trafia do kolejnego żądania. Dlatego każda interakcja
deklaruje provider state, a `provider/verify-pact.ts` zasiewa dokładnie te wiersze
w `cargo_plans.*` przez `pg`. Każdy handler najpierw kasuje swoje `plan_id`, bo
weryfikacja naprawdę zmienia dane (usuwa towar, zmienia naczepę, finalizuje plan).
Po zakończeniu baza jest sprzątana.

| state | zasiewa |
|---|---|
| `the TMS accepts new load plans` | nic (czysty stan) |
| `a draft load plan exists with no cargo` | plan DRAFT bez jednostek |
| `a draft load plan exists with two GENERAL cargo units` | plan DRAFT + 2 × epal1/GENERAL |
| `a draft load plan exists with a CHEMICAL cargo unit` | plan DRAFT + 1 × cp1/CHEMICAL |
| `no load plan exists with the given id` | usuwa dane id |

## Trzy wersje kontraktu

`CONTRACT_VARIANT` przełącza kształt `GET /cargo-plans/{id}`, którego żąda klient.
Każdy wariant łączy oczekiwanie Pakta z projekcją, którą klient faktycznie wykonuje –
kontrakt nie może więc żądać pola, którego nikt nie czyta.

| wersja | zmiana w `GET /cargo-plans/{id}` | weryfikacja providera |
|---|---|---|
| **1.0.0** (`v1`) | pełny read model | ✅ przechodzi |
| **2.0.0** (`v2`) | usuwa `trailer.capabilities` i `units[].requirements` | ✅ przechodzi – zawężenie kontraktu jest wstecznie kompatybilne; provider może dalej zwracać te pola, Pact sprawdza tylko to, o co poproszono |
| **3.0.0** (`v3`) | zmienia nazwę `units[].requirements` → `units[].handlingRequirements` | ❌ `$.units[0] -> Actual map is missing the following keys: handlingRequirements` |

> Plik paktu jest przed każdym uruchomieniem kasowany. Pact domyślnie **dokleja**
> interakcje do istniejącego pliku, więc bez tego „konsument przestał prosić o pole”
> nigdy nie dotarłoby do brokera.

## Przejście całej ścieżki

```bash
B=http://localhost:9292

# v1 – kontrakt, weryfikacja, wdrożenie obu stron
CONTRACT_VARIANT=v1 npm run test:consumer
VERIFY_CONSUMER_VERSION=1.0.0 npm run test:provider
npx pact-broker create-environment --name production --production --broker-base-url $B
npx pact-broker record-deployment --pacticipant TmsApi --version 1.0.0 --environment production --broker-base-url $B
npx pact-broker can-i-deploy --pacticipant CargoPlannerCli --version 1.0.0 --to-environment production --broker-base-url $B
npx pact-broker record-deployment --pacticipant CargoPlannerCli --version 1.0.0 --environment production --broker-base-url $B

# v2 – konsument zawęża kontrakt
CONTRACT_VARIANT=v2 npm run test:consumer
npx pact-broker can-i-deploy --pacticipant CargoPlannerCli --version 2.0.0 --to-environment production --broker-base-url $B   # jeszcze nie zweryfikowany → blokada
VERIFY_CONSUMER_VERSION=2.0.0 npm run test:provider
npx pact-broker can-i-deploy --pacticipant CargoPlannerCli --version 2.0.0 --to-environment production --broker-base-url $B
npx pact-broker record-deployment --pacticipant CargoPlannerCli --version 2.0.0 --environment production --broker-base-url $B

# v3 – konsument zmienia nazwę pola (breaking)
CONTRACT_VARIANT=v3 npm run test:consumer
VERIFY_CONSUMER_VERSION=3.0.0 npm run test:provider    # ✗ weryfikacja pada
```

## Can I Deploy? Kogo broker przepuszcza?

Stan: w `production` są `TmsApi 1.0.0` i `CargoPlannerCli 2.0.0`, a `3.0.0` jest
opublikowany na branchu `main` i czerwony.

```
can-i-deploy CargoPlannerCli 3.0.0 → production                  ✗ exit 1
    The verification for the pact between version 3.0.0 of CargoPlannerCli
    and the version of TmsApi currently in production (1.0.0) failed

can-i-deploy TmsApi 1.0.0 → production                           ✓ exit 0
    CargoPlannerCli 2.0.0 | TmsApi 1.0.0 | true

can-i-deploy TmsApi 1.0.0  (najnowsze wersje wszystkich konsumentów, bez środowiska)
                                                                 ✗ exit 1
    CargoPlannerCli 3.0.0 | TmsApi 1.0.0 | false
    TmsFrontend  1.0.0-…  | TmsApi 1.0.0 | true
```

Broker przepuszcza więc **providera** – wszystko, co faktycznie działa na produkcji,
nadal przechodzi – a zatrzymuje **konsumenta**, który złamał własne oczekiwania.
Trzecie zapytanie pokazuje, po co podawać środowisko: bez niego provider mierzony jest
najnowszym kontraktem każdego konsumenta, łącznie z czerwonymi gałęziami.

Żeby v3 zazieleniło się, albo provider musi dorobić `handlingRequirements`, albo
konsument wycofać zmianę nazwy – i o wymuszenie dokładnie tej rozmowy w CDC chodzi.

Exit code `0` = OK, `1` = blokada.

> Uwaga: po przejściu całej ścieżki `npm test` jest **czerwony** – i tak ma być.
> Najnowszym kontraktem na `main` jest celowo zepsuty `3.0.0`, więc krok providera pada.
> Żeby wrócić do zieleni, wystarczy opublikować kształt `v1` jako nowszą wersję:
> `CONTRACT_VARIANT=v1 CONSUMER_VERSION=4.0.0 npm run test:consumer && npm run test:provider`.

## Weryfikacja: co provider bierze pod uwagę

Bez `VERIFY_CONSUMER_VERSION` `test:provider` zachowuje się jak build CI: weryfikuje
najnowsze kontrakty konsumentów z brancha `main` **oraz** wszystko, co jest aktualnie
wdrożone (`consumerVersionSelectors: [{ branch, latest: true }, { deployed: true }]`).
Zielony build znaczy wtedy „bezpieczne dla tego, co nadchodzi, i dla tego, co już
działa”. `VERIFY_CONSUMER_VERSION` zamienia to na jeden przypięty adres paktu.
