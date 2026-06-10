# Best Practices: Dockerfile & Docker Compose

Reguły zebrane na podstawie modułu M06 (DevOps / Konteneryzacja) oraz aktualnych standardów branżowych. Plik przeznaczony do użycia jako reguły dla agenta AI (rules / system prompt) lub jako checklist zespołowy.

---

## 1. Dockerfile

### 1.1 Obraz bazowy

* **Wybieraj możliwie małe obrazy bazowe, ale adekwatne do technologii.** Duże dystrybucje wciągają setki MB zbędnych pakietów. Skala problemu na przykładzie: `python:3.13` (pełny Debian) ~400 MB, `python:3.13-slim` ~45 MB, `python:3.13-alpine` ~18 MB.
* **`slim` to optymalny default dla języków interpretowanych** (np. `python:3.13-slim`, `node:22-slim`). `alpine` bazuje na `musl libc` (zamiast `glibc`), co w Pythonie czy Node zmusza do kompilacji wielu pakietów ze źródeł, dramatycznie wydłużając czas budowania i niwecząc zyski rozmiaru. `alpine` jest za to świetny dla języków kompilowanych (Go, Rust). `distroless` (Google) to opcja radykalna (brak powłoki i narzędzi systemowych, minimalna powierzchnia ataku) na bardzo restrykcyjne środowiska produkcyjne.
* **Pinuj wersje precyzyjnie (najlepiej po digestach) i automatyzuj aktualizacje.** Tagi są mutowalne — obraz pobrany dziś pod tym samym tagiem może różnić się od pobranego jutro. Zamiast `latest`, schodź do poziomu hashów obrazu (`node:22.19-slim@sha256:12345...`). Zamrożenie wersji gwarantuje powtarzalność, ale zmusza do użycia narzędzi (np. **Renovate**, **Dependabot**), aby nie obudzić się za pół roku z setkami CVE w starym obrazie.
* **Pamiętaj o multi-architecture.** Budując obraz lokalnie na procesorze ARM (Apple Silicon), serwer CI/CD z architekturą x86 go nie uruchomi (błąd *exec format error*). Używaj Docker Buildx (np. `--platform linux/amd64`).
* Pamiętaj, że obraz nie musi zawierać systemu operacyjnego — kontener i tak współdzieli kernel hosta.

### 1.2 Warstwy i cache

* **Tylko `FROM`, `RUN`, `COPY`, `ADD` tworzą warstwy zmieniające system plików.** Pozostałe (`EXPOSE`, `ENV`, `USER`, `WORKDIR`, `CMD`) to tylko metadane (0 bajtów w warstwie).
* **Zawsze używaj `COPY` zamiast `ADD`.** `ADD` stosuj tylko wtedy, gdy chcesz, aby Docker automatycznie rozpakował archiwum tar do kontenera.
* **Kolejność instrukcji ma znaczenie.** To, co zmienia się najrzadziej (instalacja pakietów systemowych), na górę; to, co najczęściej (kod aplikacji), na dół. Unieważnienie warstwy unieważnia wszystkie kolejne.
* **Wzorzec dla zależności:** najpierw skopiuj tylko plik manifestu (`package.json`, `requirements.txt`, `pom.xml`), potem zainstaluj zależności, a dopiero na końcu skopiuj kod aplikacji. Dzięki temu warstwa z instalacją (najcięższa) zostaje w cache, jeśli zmieniasz tylko kod.
* **Łącz powiązane komendy** przez `&&` w jednym `RUN` — Dockerfile nie powinien wyglądać jak skrypt bashowy. Używaj cache mount (`RUN --mount=type=cache`) dla menedżerów pakietów (npm/pip), by przyspieszyć ponowne budowanie.
* `ARG` to zmienna dostępna **tylko w czasie budowania** (z wartością domyślną, nadpisywalną z CLI); nie myl jej ze zmiennymi środowiskowymi runtime'u (`ENV` / `environment` w Compose).

### 1.3 Multi-stage builds

* **Zawsze stosuj multi-stage builds dla środowisk produkcyjnych.** Kompilatory, dev dependencies i narzędzia developerskie nie mogą trafiać na produkcję.
* Typowy układ: etap `development` (serwer dev), etap `build` budujący artefakty (np. `npm ci` + `npm run build` — uwaga: przez `RUN`, nie `CMD`), etap `production` startujący z czystego obrazu (np. NGINX) i kopiujący tylko wynik: `COPY --from=build /app/dist /usr/share/nginx/html`.
* Finalny obraz zawiera warstwy wyłącznie ostatniego budowanego etapu. Efekt: krótsze buildy CI, dramatycznie mniejszy rozmiar i ograniczona powierzchnia ataku.
* Build konkretnego etapu: `docker build --target <nazwa-etapu>`; analogiczny parametr `target` istnieje w Docker Compose.

### 1.4 Bezpieczeństwo i uprawnienia

* **Nigdy nie uruchamiaj procesów jako root.** Docker domyślnie wykonuje komendy jako root — zmieniaj użytkownika instrukcją `USER` (w obrazach Node dedykowany user już istnieje; w innych użyj `RUN adduser`).
* **Uwaga na `COPY` po zmianie usera:** domyślnie `COPY` kopiuje pliki jako root. Jeśli dodałeś użytkownika `node`, używaj `COPY --chown=node:node . .`, w przeciwnym razie aplikacja nie będzie mogła niczego zapisać.
* **`EXPOSE` to przede wszystkim dokumentacja.** Sama instrukcja `EXPOSE 8080` nie publikuje portu — informuje, na czym nasłuchuje usługa. O faktycznym otwarciu portów decyduje `ports` w Compose lub infrastruktura. Jedyny wyjątek: `docker run -P` publikuje wszystkie porty z `EXPOSE` na losowe porty hosta.
* Regularnie sprawdzaj podatności obrazów — Docker Hub / Docker Desktop listuje CVE per wersja obrazu (patrz też sekcja 3: Trivy, Docker Scout).

### 1.5 Cykl życia: ENTRYPOINT, CMD i PID 1 (krytyczne)

* **Zawsze używaj formy tablicowej (exec form) dla komend startowych:** `CMD ["node", "app.js"]` zamiast formy powłokowej `CMD node app.js`.
* *Dlaczego?* Forma powłoki uruchamia proces jako podproces `/bin/sh -c`. Kiedy Docker (lub Kubernetes) próbuje zatrzymać kontener, wysyła sygnał `SIGTERM`. Powłoka go pochłania i nie przekazuje do aplikacji. Aplikacja nie zamyka połączeń z bazą, Docker po 10 sekundach wysyła `SIGKILL` (twarde ubicie) — efekt: utracone dane i sypiące się requesty (brak *graceful shutdown*).
* Obrazy uruchamiające się bezpośrednio jako PID 1 powinny używać lekkich menedżerów procesów (np. pakiet `tini` zdefiniowany w `ENTRYPOINT`) albo `init: true` po stronie Compose.
* **`ENTRYPOINT` vs `CMD`:** używaj `ENTRYPOINT` do wskazania głównego pliku wykonywalnego, a `CMD` do przekazania mu domyślnych (nadpisywalnych) argumentów: `ENTRYPOINT ["python", "app.py"]` + `CMD ["--port", "8080"]`.
* Rozróżniaj: `RUN` wykonuje się **podczas budowania obrazu** (tworzy warstwę), `CMD`/`ENTRYPOINT` to komenda startowa **kontenera**.

---

## 2. Docker Compose

### 2.1 Konfiguracja i sekrety

* **Zero hardkodów (12-factor).** Żadnych haseł, kluczy i URL-i zahardkodowanych w obrazie czy w compose — konfiguracja przychodzi z zewnątrz.
* Zmienne środowiskowe (`environment` / `env_file`) są lepsze niż hardkod, ale wciąż słabe: ich wartości są widoczne w procesie i w `docker inspect`, mogą też wyciec do logów.
* **Docker Secrets:** w zwykłym Docker Compose sekrety (`secrets`) to po prostu pliki zamontowane w `/run/secrets/`. **Nie są szyfrowane** (szyfrowanie at-rest/in-transit dotyczy tylko trybu Docker Swarm). Są jednak bezpieczniejsze niż zmienne środowiskowe: ich *zawartość* nie pojawia się ani w środowisku procesu, ani w outputach `docker inspect` (widoczna jest tylko definicja montowania), ani w logach.
* Branżowy standard na produkcji: dedykowana usługa typu **HashiCorp Vault** lub odpowiednik chmurowy — krótko żyjące poświadczenia z TTL, rotacja, odnawianie dostępu po stronie klienta.
* Pliki `.env` oraz pliki sekretów **nigdy** nie trafiają do repozytorium.

### 2.2 Obrazy i usługi

* Użycie w usłudze jednocześnie `build:` i `image:` jest dozwolone i przydatne, gdy chcesz lokalnie zbudować obraz i od razu przypisać mu konkretną nazwę/tag do późniejszego wysłania do rejestru (push).
* Pinuj pełne, precyzyjne tagi obrazów również w compose; `latest` jest nieprzewidywalny.
* Zniszczenie kontenera (`down`) i jego podniesienie (`up -d`) **nie przebudowuje obrazu**, jeśli ten już istnieje — wstanie stara wersja (częste źródło „czemu to nie działa"). Aby wymusić budowę: `docker compose build` lub `docker compose up --build`; można też użyć `pull_policy: build`.
* Obrazu nie da się usunąć, dopóki istnieje kontener z niego utworzony — nawet zatrzymany.

### 2.3 Sieci

* Domyślna sieć to „jeden worek dla wszystkich". **Ograniczaj widoczność usług do absolutnego minimum** — twórz własne sieci, np. `frontend-network`, `db-network`, tak by każda usługa widziała tylko to, z czym musi się komunikować.
* **Nigdy nie mapuj portów baz danych ani narzędzi administracyjnych (Postgres, Redis, pgAdmin) na porty hosta (`ports`), jeśli nie jest to konieczne.** Do bazy łącz się wewnątrz sieci Dockera. Światu wystawiaj wyłącznie reverse proxy / API gateway.
* `ports: "8000:80"` mapuje port 8000 hosta na 80 w kontenerze (HOST:KONTENER).
* Typowy błąd „usługa nie widzi hosta X" to prawie zawsze problem z przypisaniem sieci. Unikaj `network_mode: host` — rozwala izolację.

### 2.4 Zasoby i hardening

* **Ustawiaj limity zasobów (RAM, CPU) także w developmencie**, żeby mieć rozeznanie, ile usługi faktycznie konsumują, i żeby jeden kontener nie zagłodził pozostałych. Limity produkcyjne wyprowadzaj z pomiarów (development, stress testy), nie z kosmosu. Do podglądu na żywo: `docker stats`.
* **Preferuj współczesną składnię Compose spec** (`deploy.resources.limits`) — jest przenośna między Compose a Swarm. Starsze flagi `mem_limit`/`cpu_shares` nadal działają, ale pamiętaj, że to nie jest zamiana 1:1: `cpu_shares` to *waga względna* w dostępie do CPU, a `cpus` to *twardy limit*.
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
```
* Przekroczenie limitu pamięci → OOM killer zabija proces kontenera (świadomie zaplanuj zachowanie po takim zdarzeniu).
* **Hardening kontenera:** tam gdzie to możliwe (usługi bezstanowe), uruchamiaj kontener w trybie read-only (`read_only: true`), z `tmpfs` na foldery potrzebne do działania (cache). Upuść niepotrzebne uprawnienia: `cap_drop: [ALL]`.

### 2.5 Logi (ochrona dysku)

* Domyślny driver logów (`json-file`) nie ma limitu wielkości — zatkany dysk to częsta awaria produkcji. Zawsze narzucaj ograniczenia per usługa lub globalnie w `/etc/docker/daemon.json`:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 2.6 Cykl życia, healthchecki i zależności

* `restart: unless-stopped` to dobry punkt wyjścia (prosty self-healing), ale uwaga: kontener z błędem konfiguracji + `restart: always` = pętla restartów.
* **PID 1:** dodaj `init: true`, jeśli obraz sam z siebie nie obsługuje poprawnie sygnałów zamknięcia (patrz sekcja 1.5).
* `depends_on: [baza]` nie poczeka, aż baza zacznie przyjmować połączenia — poczeka tylko na uruchomienie procesu. Do prawidłowego oczekiwania używaj healthchecków z warunkiem:
```yaml
depends_on:
  db:
    condition: service_healthy
```
* Gotowość definiuj blokiem `healthcheck` w Compose lub instrukcją `HEALTHCHECK` w Dockerfile.

### 2.7 Wolumeny

* **Sieci i wolumeny mają cykl życia niezależny od kontenerów.** Usunięcie kontenera nie usuwa wolumenu — miej to stale z tyłu głowy.
* **Named volumes** — dane perzystentne, które muszą przetrwać śmierć kontenera (pliki Postgresa, Mongo, Redisa). Na produkcji niszczenie kontenera nie może oznaczać niszczenia danych.
* **Bind mounts** — synchronizacja plików z hosta. W developmencie świetny mechanizm dla kodu; na produkcji wyłącznie do wgrywania zewnętrznej konfiguracji czy skryptów inicjalizacyjnych (np. `init.sql` → `/docker-entrypoint-initdb.d`). Konkretne obrazy oczekują konkretnych ścieżek — poznaj specyfikę używanych obrazów.
* **Wolumeny anonimowe** — dane tymczasowe; bez dodatkowych flag pozostają po usunięciu kontenera jako *dangling volumes*.

### 2.8 Środowiska i profile

* Różne przypadki użycia (dev/test/prod) → **profile** Compose lub osobne pliki (`docker compose -f plik.yaml`). Profile działają wykluczająco: usługa z profilem wstaje tylko, gdy profil jest jawnie wskazany (`--profile dev`); usługi bez profilu wstają zawsze.
* Compose jest świetny do developmentu, ale **rzadko nadaje się na produkcję**: brak dynamic provisioning, liczba kontenerów = liczba wpisów w `services`. Przy potrzebie skali → orkiestratory (Kubernetes). Systemy o mniejszym ruchu mogą jednak sensownie działać na VM-kach z Docker Engine — nie każdy system potrzebuje chmury.

### 2.9 Cloud Native / 12-factor

* **Aplikacje bezstanowe:** serwer aplikacyjny nie trzyma na lokalnym dysku plików determinujących stan (logi, dane → na zewnątrz, do dedykowanych usług). Tylko wtedy skalowanie horyzontalne ma sens. Pytanie kontrolne: gdyby uruchomić z obrazu liczne kontenery w środowisku z dynamic provisioning, czy któryś tworzy sobie lokalne pliki, których później potrzebuje?
* **Build, Release i Run jako osobne etapy:** wdrożenie istniejącego obrazu nie może wymagać jego przebudowy; ten sam obraz + różna konfiguracja per środowisko.
* Endpointy zależności (host bazy itd.) przekazywane z zewnątrz — system musi przeżyć przepięcie na inny węzeł bez przebudowy i ręcznego restartu.

---

## 3. Ekosystem, debugowanie i utrzymanie

* **Brak `.dockerignore` to strzał w kolano.** Zapobiega przesyłaniu plików takich jak `.git`, `node_modules`, cache czy pliki developerskie do kontekstu builda (a przez `COPY` — do obrazu).
* **Lintery to konieczność:** używaj `hadolint` do sprawdzania Dockerfile w CI.
* **Analiza bezpieczeństwa i warstw:** narzędzia typu **Trivy** czy **Docker Scout** w pipeline do łapania CVE; **dive** do oglądania zawartości i rozmiaru poszczególnych warstw obrazu (warstwa po warstwie, plik po pliku).
* **Monitoruj rozmiar obrazu na przestrzeni czasu**, najlepiej automatycznie w CI — nagły skok rozmiaru łatwo powiązać z konkretnym commitem.
* **Higiena Docker Engine:** obrazy i wolumeny potrafią urosnąć do grubych gigabajtów. W dev używaj `docker compose down -v` (czyści wolumeny stacka); regularnie: `docker volume prune`, `docker image prune` (dangling images), `docker system prune --all --volumes`. Monitoruj zajętość dysku.
* **Debugowanie:** `docker compose ps` / `docker compose logs` to pierwszy krok — logi usługi (np. Postgresa) często wskazują prawdziwą przyczynę, której nie widać w stack trace aplikacji. `docker exec -it <kontener> <shell/psql/...>` do wejścia do środka (coraz częściej robią to też agenty AI, np. przez MCP). `docker cp` do szybkiej wymiany plików host↔kontener bez przebudowy obrazu.
* Zamiast ciągłego przebudowywania obrazu dla drobnych zmian w devie, rozważ **`docker compose watch`** (Compose Watch / Develop Specification) — automatyczna synchronizacja katalogów z żyjącym kontenerem, albo **Dev Containers** przy częstych modyfikacjach od środka.

---

## 4. Checklist przed merge

* [ ] Obraz bazowy mały i adekwatny do języka (`slim` dla interpretowanych, `alpine` dla binarów Go/Rust), przypięty (digest) + automatyzacja łatek (Renovate/Dependabot)
* [ ] Kolejność warstw zoptymalizowana pod cache (manifest → instalacja zależności → kopia kodu)
* [ ] Multi-stage build — produkcyjny kontener bez paczek developerskich i kompilatorów
* [ ] `USER` ustawiony i `COPY --chown=<user>` tam, gdzie trzeba — nic nie działa jako root
* [ ] `CMD`/`ENTRYPOINT` w formie tablicowej (exec form) — zagwarantowany *graceful shutdown* (`init: true` w compose, gdy trzeba)
* [ ] `.dockerignore` kompletny; Dockerfile zlintowany (`hadolint`), obraz przeskanowany pod CVE (Trivy / Docker Scout); rozmiar monitorowany (dive / CI)
* [ ] Brak sekretów w obrazie, compose i repo; sekrety przez Compose Secrets / Vault
* [ ] Tagi w compose przypięte; brak `latest`
* [ ] Limity logów ustawione (`max-size`, `max-file`) — aplikacja nie wysyci dysku
* [ ] Limity zasobów (RAM/CPU) przez `deploy.resources.limits` (także w dev)
* [ ] Sieci zaprojektowane minimalistycznie; bazy/adminy nie wystawiają portów na hosta; na zewnątrz tylko reverse proxy
* [ ] Start i gotowość: `depends_on` + `condition: service_healthy` + `healthcheck`; restart policy świadoma (ryzyko pętli)
* [ ] Wolumeny dobrane do intencji: named (dane), bind (dev/konfiguracja), `read_only` + `tmpfs` + `cap_drop` gdzie możliwe
* [ ] Profile lub osobne pliki compose dla różnych środowisk; aplikacja bezstanowa (gotowa na skalowanie horyzontalne)