# Best Practices: Dockerfile & Docker Compose

Reguły zebrane na podstawie modułu M06 (DevOps / Konteneryzacja). Plik przeznaczony do użycia jako reguły dla agenta AI (rules / system prompt) lub jako checklist zespołowy.

---

## 1. Dockerfile

### 1.1 Obraz bazowy

- **Wybieraj możliwie małe obrazy bazowe.** Duże dystrybucje (np. pełny Debian) wciągają setki MB pakietów, których aplikacja nie używa. Dla porównania: `python:3.13` (Debian/Trixie) ~400 MB, `python:3.13-slim` ~45 MB, `python:3.13-alpine` ~18 MB.
- **`alpine` to dobry default** — minimalistyczny, ale bez przeginania. `slim` to odchudzona wersja obrazu bazowego. `distroless` (Google) to opcja radykalna: brak narzędzi systemowych i powłoki, minimalna powierzchnia ataku — stosuj świadomie.
- **Pinuj wersje możliwie precyzyjnie.** Tagi są mutowalne — obraz pobrany dziś pod tym samym tagiem może różnić się od pobranego jutro. Unikaj `latest`. Schodź jak najgłębiej: wersja platformy → wersja OS (np. `node:22.19-alpine3.20`) → docelowo **konkretny hash (digest) obrazu**, rekomendowany przez twórców Dockera. Bez usztywnienia tagów build jest niepowtarzalny.
- Pamiętaj, że obraz nie musi zawierać systemu operacyjnego — kontener i tak współdzieli kernel hosta.

### 1.2 Warstwy i cache

- **Tylko `FROM`, `RUN`, `COPY`, `ADD` tworzą warstwy zmieniające system plików.** Instrukcje typu `ARG`, `EXPOSE`, `USER`, `CMD`, `WORKDIR` modyfikują wyłącznie metadane (0 bajtów w warstwie).
- **Kolejność instrukcji ma znaczenie.** To, co zmienia się najrzadziej, na górę; to, co najczęściej — na dół. Unieważnienie warstwy unieważnia wszystkie kolejne.
- **Wzorzec dla zależności:** najpierw kopiuj sam plik manifestu (`package.json`, `requirements.txt`, `pom.xml`), potem instaluj zależności, a dopiero na końcu kopiuj kod aplikacji. Dzięki temu warstwa z zależnościami pozostaje w cache mimo zmian w kodzie.
- **Łącz powiązane komendy shellowe** przez `&&` w jednym `RUN`, żeby nie produkować zbędnych warstw. Dockerfile nie powinien wyglądać jak skrypt bashowy.
- Rozważ **cache mount** (`RUN --mount=type=cache`) dla cache'ów menedżerów pakietów, aby przyspieszyć przebudowy.

### 1.3 Multi-stage builds

- **Dla aplikacji biznesowych w większości przypadków używaj multi-stage builds.** Pakiety potrzebne do budowania (kompilatory, dev dependencies) nie powinny trafiać do obrazu produkcyjnego.
- Typowy układ: etap `development` (serwer dev), etap `build` (np. `npm ci` + `npm run build` — uwaga: `RUN`, nie `CMD`), etap `production` (np. `nginx:alpine` + `COPY --from=build` tylko artefaktów).
- Finalny obraz zawiera warstwy wyłącznie ostatniego budowanego etapu. Efekt: mniejszy rozmiar, mniejsza powierzchnia ataku, szybsze pipeline'y CI/CD.
- Build konkretnego etapu: `docker build --target <nazwa-etapu>`; analogiczny parametr `target` istnieje w Docker Compose.

### 1.4 Bezpieczeństwo

- **Nigdy nie uruchamiaj procesów jako root.** Docker domyślnie wykonuje komendy jako root — przełącz się instrukcją `USER` (w obrazach Node dedykowany user już istnieje; w innych użyj `RUN adduser`).
- **Wystawiaj (`EXPOSE`) tylko porty, które są konieczne.** Jeśli usługa używa wielu portów, a na zewnątrz potrzebny jest jeden — wystawiaj jeden.
- Mniejszy obraz = mniejsza powierzchnia ataku. Regularnie sprawdzaj podatności obrazów (Docker Hub / Docker Desktop listuje CVE per wersja obrazu).
- Żadnych sekretów i hardkodów w obrazie — konfiguracja przychodzi z zewnątrz (patrz sekcja 12-factor).

### 1.5 Zawartość obrazu

- **Utrzymuj `.dockerignore`** (analogicznie do `.gitignore`): pliki developerskie, `node_modules`, cache, `.git`, sekrety — nic z tego nie powinno trafiać do obrazu przez `COPY`. Ładuj do obrazu tylko to, co konieczne.
- **Monitoruj rozmiar obrazu na przestrzeni czasu**, najlepiej automatycznie w CI. Nagły skok rozmiaru → łatwo namierzyć commit, który go spowodował.
- Do analizy zawartości warstw używaj narzędzia **`dive`** — pokazuje plik po pliku, co i ile waży w każdej warstwie.

### 1.6 RUN vs CMD vs ARG

- `RUN` wykonuje się **podczas budowania obrazu** (tworzy warstwę), `CMD` to komenda startowa **kontenera**.
- `ARG` to zmienna dostępna **tylko w czasie budowania** (z wartością domyślną, nadpisywalną z CLI); nie myl jej ze zmiennymi środowiskowymi runtime'u.

---

## 2. Docker Compose

### 2.1 Konfiguracja i sekrety

- **Zero hardkodów** — żadnych haseł, kluczy i URL-i wpisanych na sztywno w obrazie czy w compose. Konfiguracja na zewnątrz kontenera (12-factor apps).
- Zmienne środowiskowe (`environment` lub `env_file`) są lepsze niż hardkod, ale wciąż słabe: widoczne w procesie, mogą wyciec do logów.
- Lepsze opcje: **Docker Secrets** (sekret szyfrowany, montowany jako plik, dostępny tylko wybranym kontenerom; env zawiera jedynie ścieżkę do pliku) lub — branżowy standard — **dedykowana usługa typu HashiCorp Vault** z rotacją krótko żyjących poświadczeń (TTL, odnawianie dostępu po stronie klienta).
- Pliki `.env` i sekrety nie trafiają do repozytorium.

### 2.2 Obrazy w usługach

- `image` **albo** `build` (context + dockerfile) — nigdy obie naraz.
- Pinuj pełne, precyzyjne tagi obrazów również w compose; `latest` jest nieprzewidywalny.
- Pamiętaj: zniszczenie kontenera i ponowne `up` **nie przebudowuje obrazu**. Po zmianach w Dockerfile/kodzie wymagany jest rebuild (`--build`), inaczej wstanie stara wersja — częste źródło „czemu to nie działa".

### 2.3 Sieci

- **Ograniczaj widoczność usług do absolutnego minimum.** Domyślny „one bridge to rule them all" jest wygodny, ale projektuj topologię sieci bridge tak, by każda usługa widziała tylko to, z czym musi się komunikować.
- **Nie mapuj publicznie portów baz danych ani narzędzi administracyjnych** (Postgres, pgAdmin itp.). Aplikacja łączy się z bazą przez wewnętrzną sieć Dockera; na zewnątrz wystawiaj wyłącznie wejście do systemu, najlepiej przez **reverse proxy** (NGINX itp.).
- Typowy błąd „usługa nie widzi hosta X" to prawie zawsze problem z przypisaniem sieci.
- Składnia `ports: "HOST:KONTENER"` — port po lewej to host, po prawej wnętrze kontenera. Unikaj `network_mode: host` (rozwala izolację).

### 2.4 Zasoby

- **Ustawiaj limity zasobów (RAM, CPU) także w developmencie**, żeby mieć rozeznanie, ile usługi faktycznie konsumują, i żeby jeden kontener nie zagłodził pozostałych.
- Przekroczenie `mem_limit` → OOM killer zabija proces kontenera. `cpu_shares` określa proporcjonalny udział w CPU (default 1024).
- Limity produkcyjne wyprowadzaj z pomiarów (development, stress testy), nie z kosmosu. Do podglądu na żywo: `docker stats`.

### 2.5 Cykl życia, restart, zależności

- `restart: unless-stopped` to prosty self-healing, ale uwaga: kontener z błędem konfiguracji + `restart: always` = pętla restartów.
- `depends_on` ustala kolejność startu (np. baza przed adminem/aplikacją); nie gwarantuje gotowości usługi — dla gotowości stosuj healthchecki.
- **Sieci i wolumeny mają cykl życia niezależny od kontenerów.** Usunięcie kontenera nie usuwa wolumenu.
- `docker compose down -v` czyści wolumeny razem ze stackiem (w dev); regularnie sprzątaj: `docker volume prune`, `docker image prune`, `docker system prune --all --volumes`. Monitoruj miejsce zajmowane przez Docker Engine.

### 2.6 Wolumeny

- **Named volumes** — dane perzystentne (pliki Postgresa, Mongo, Redisa), przeżywają śmierć kontenera. Na produkcji niszczenie kontenera nie może oznaczać niszczenia danych.
- **Bind mounts** — mapowanie pliku/folderu z hosta (np. `init.sql` → `/docker-entrypoint-initdb.d`, konfiguracje per środowisko). Konkretne obrazy oczekują konkretnych ścieżek — poznaj specyfikę używanych obrazów.
- **Wolumeny anonimowe** — dane tymczasowe; pamiętaj, że bez flag pozostają jako *dangling volumes* po usunięciu kontenera.
- Bind mount kodu źródłowego jest OK w developmencie, ale **nie w produkcji**.

### 2.7 Środowiska i profile

- Różne przypadki użycia (dev/test/prod) → **profile** Compose lub osobne pliki `docker-compose.yaml` (`-f plik.yaml`). Profile działają wykluczająco: usługa z profilem wstaje tylko, gdy profil jest jawnie wskazany.
- Compose jest świetny do developmentu, ale **rzadko nadaje się na produkcję**: brak dynamic provisioning, liczba kontenerów = liczba wpisów w `services`. Dla skali → orkiestratory (Kubernetes).

### 2.8 Cloud Native / 12-factor

- **Aplikacje bezstanowe**: serwer aplikacyjny nie trzyma na lokalnym dysku plików determinujących stan (logi, dane → na zewnątrz). Tylko wtedy skalowanie horyzontalne ma sens.
- Build, Release i Run jako osobne etapy: wdrożenie istniejącego obrazu nie może wymagać jego przebudowy; ten sam obraz + różna konfiguracja per środowisko.
- Endpointy zależności (host bazy itd.) przekazywane z zewnątrz — system musi przeżyć przepięcie na inny węzeł bez przebudowy/restartu „z palca".

---

## 3. Debugowanie i utrzymanie (skrót)

- `docker ps`, `docker compose ps`, `docker compose logs` — pierwszy krok przy problemach; logi usług z kontenera zwykle wskazują przyczynę (np. brakująca kolumna w SQL widoczna w logach Postgresa, nie tylko w stack trace aplikacji).
- `docker exec -it <kontener> <shell/psql/...>` — wejście do środka kontenera; coraz częściej będą to robić agenty (np. przez MCP).
- Obrazu nie da się usunąć, dopóki istnieje kontener z niego utworzony (nawet zatrzymany).
- `docker cp` — szybka wymiana plików host↔kontener bez przebudowy obrazu (przydatne, gdy build trwa długo).

---

## 4. Checklist przed merge

- [ ] Obraz bazowy mały i przypięty do precyzyjnej wersji (docelowo digest)
- [ ] Kolejność warstw: manifest → zależności → kod
- [ ] Multi-stage build; brak dev dependencies w obrazie produkcyjnym
- [ ] `USER` ustawiony — nic nie działa jako root
- [ ] `.dockerignore` kompletny; rozmiar obrazu sprawdzony (dive / CI)
- [ ] Brak sekretów w obrazie, compose i repo; sekrety przez Secrets/Vault
- [ ] Tagi w compose przypięte; brak `latest`
- [ ] Limity RAM/CPU ustawione (także w dev)
- [ ] Sieci zaprojektowane minimalistycznie; bazy/adminy nie wystawione na hosta
- [ ] Wolumeny: named dla danych, bind mount kodu tylko w dev
- [ ] Restart policy świadoma (ryzyko pętli); `depends_on`/healthchecki ustawione
- [ ] Profile lub osobne pliki compose dla różnych środowisk