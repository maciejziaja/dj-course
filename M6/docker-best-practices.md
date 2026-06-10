# Best Practices: Dockerfile & Docker Compose

Reguły zebrane na podstawie modułu M06 (DevOps / Konteneryzacja) oraz aktualnych standardów branżowych. Plik przeznaczony do użycia jako reguły dla agenta AI (rules / system prompt) lub jako checklist zespołowy.

---

## 1. Dockerfile

### 1.1 Obraz bazowy

* **Wybieraj możliwie małe obrazy bazowe, ale adekwatne do technologii.** Duże dystrybucje wciągają setki MB zbędnych pakietów.
* **`slim` to optymalny default dla języków interpretowanych** (np. `python:3.13-slim`, `node:22-slim`). `alpine` bazuje na `musl libc` (zamiast `glibc`), co w Pythonie (czy Node) zmusza do kompilacji wielu pakietów ze źródeł, dramatycznie wydłużając czas budowania i niwecząc zyski rozmiaru. `alpine` jest za to świetny dla języków kompilowanych (Go, Rust). `distroless` (Google) to opcja radykalna (brak powłoki) na bardzo restrykcyjne środowiska produkcyjne.
* **Pinuj wersje precyzyjnie (najlepiej po digestach) i automatyzuj aktualizacje.** Tagi są mutowalne. Zamiast `latest`, schodź do poziomu hashów obrazu (`node:22.19-slim@sha256:12345...`). Zamrożenie wersji gwarantuje powtarzalność, ale zmusza do użycia narzędzi (np. **Renovate**, **Dependabot**), aby nie obudzić się za pół roku z setkami CVE (luk bezpieczeństwa) w starym obrazie.
* **Pamiętaj o multi-architecture.** Budując obraz lokalnie na procesorze ARM (Apple Silicon), serwer CI/CD z architekturą x86 go nie uruchomi (błąd *exec format error*). Używaj Docker Buildx (np. `--platform linux/amd64`).

### 1.2 Warstwy i cache

* **Tylko `FROM`, `RUN`, `COPY`, `ADD` tworzą warstwy zmieniające system plików.** Pozostałe (`EXPOSE`, `ENV`, `CMD`) to tylko metadane (0 bajtów).
* **Zawsze używaj `COPY` zamiast `ADD`.** `ADD` stosuj tylko wtedy, gdy chcesz, aby Docker automatycznie rozpakował archiwum tar do kontenera.
* **Kolejność instrukcji ma znaczenie.** To, co zmienia się najrzadziej (instalacja pakietów systemowych) na górę; to, co najczęściej (kod aplikacji) na dół.
* **Wzorzec dla zależności:** najpierw skopiuj tylko plik manifestu (`package.json`, `requirements.txt`), potem zainstaluj zależności, a dopiero na końcu skopiuj kod aplikacji. Dzięki temu warstwa z instalacją (najcięższa) zostaje w cache, jeśli zmieniasz tylko kod.
* **Łącz powiązane komendy** przez `&&` w jednym `RUN`. Używaj cache mount (`RUN --mount=type=cache`) dla menedżerów pakietów (npm/pip), by przyspieszyć ponowne budowanie.

### 1.3 Multi-stage builds

* **Zawsze stosuj multi-stage builds dla środowisk produkcyjnych.** Kompilatory i narzędzia developerskie nie mogą trafiać na produkcję.
* Etap `build` buduje artefakty (np. `npm run build`), a w etapie `production` bierzesz czysty obraz (np. NGINX) i kopiujesz tylko wynik: `COPY --from=build /app/dist /usr/share/nginx/html`.
* Skraca to czas buildów CI, dramatycznie zmniejsza rozmiar obrazu i ogranicza powierzchnię ataku.

### 1.4 Bezpieczeństwo i uprawnienia

* **Nigdy nie uruchamiaj procesów jako root.** Zmieniaj użytkownika za pomocą instrukcji `USER`.
* **Uwaga na `COPY` po zmianie usera:** Domyślnie `COPY` kopiuje pliki jako root. Jeśli dodałeś użytkownika `node`, używaj `COPY --chown=node:node . .`, w przeciwnym razie aplikacja nie będzie mogła niczego zapisać.
* **`EXPOSE` to tylko dokumentacja.** Instrukcja `EXPOSE 8080` nie udostępnia portu sama w sobie. Mówi tylko innym programistom, na jakim porcie nasłuchuje usługa. O faktycznym otwarciu portów na zewnątrz decyduje `ports` w Compose lub infrastruktura.

### 1.5 Cykl życia: ENTRYPOINT, CMD i PID 1 (KRYTYCZNE)

* **Zawsze używaj formy tablicowej (exec form) dla komend startowych:** `CMD ["node", "app.js"]` zamiast formy powłokowej `CMD node app.js`.
* *Dlaczego?* Forma powłoki uruchamia proces jako podproces `/bin/sh -c`. Kiedy Docker (lub Kubernetes) próbuje zatrzymać kontener, wysyła sygnał `SIGTERM`. Powłoka go pochłania i nie przekazuje do aplikacji. Aplikacja nie zamyka połączeń z bazą, Docker po 10 sekundach wysyła `SIGKILL` (twarde ubicie) — efekt: utracone dane i sypiące się requesty (brak *graceful shutdown*).
* Obrazy uruchamiające się bezpośrednio jako PID 1 powinny używać lekkich menedżerów procesów (np. pakiet `tini` zdefiniowany w ENTRYPOINT).
* **`ENTRYPOINT` vs `CMD`:** Używaj `ENTRYPOINT` do wskazania głównego pliku wykonywalnego, a `CMD` do przekazania mu domyślnych (nadpisywalnych) argumentów: `ENTRYPOINT ["python", "app.py"]` + `CMD ["--port", "8080"]`.

---

## 2. Docker Compose

### 2.1 Konfiguracja i sekrety

* **Zero hardkodów (12-factor).** Żadnych haseł i URL-i zahasowanych w obrazie.
* **Docker Secrets:** W zwykłym Docker Compose sekrety (`secrets`) to po prostu zamontowane pliki w `/run/secrets/`. **Nie są szyfrowane** (szyfrowanie w locie dotyczy tylko trybu Docker Swarm). Są jednak bezpieczniejsze niż zmienne środowiskowe, bo nie widać ich w procesach powłoki, w poleceniu `docker inspect` ani nie lądują w logach.
* Zmienne środowiskowe z plików `.env` ładuj bezpiecznie i pamiętaj, że pliki te (oraz sekrety) *nigdy* nie trafiają do repozytorium.

### 2.2 Obrazy i usługi

* Użycie w komponencie jednocześnie `build:` i `image:` jest dozwolone i przydatne, gdy chcesz lokalnie zbudować obraz i od razu przypisać mu konkretną nazwę do późniejszego wysłania do rejestru (push).
* Zniszczenie kontenera (`down`) i jego podniesienie (`up -d`) **nie przebudowuje obrazu**, jeśli ten już istnieje. Aby wymusić budowę, użyj `docker compose build` lub `docker compose up --build`. Od niedawna można też używać `pull_policy: build`.

### 2.3 Sieci

* Domyślna sieć to "jeden worek dla wszystkich". Ograniczaj widoczność — twórz własne sieci, np. `frontend-network`, `db-network`.
* **Nigdy nie mapuj portów baz danych (Postgres, Redis) na porty hosta publicznego (`ports`), jeśli nie jest to konieczne.** Do bazy łącz się wewnątrz sieci dockera. Wystawiaj światu wyłącznie reverse proxy / API gateway.
* `ports: "8000:80"` mapuje port 8000 hosta na 80 w kontenerze.

### 2.4 Zasoby i Hardening

* Nie używaj przestarzałych flag `mem_limit` czy `cpu_shares`. **Stosuj współczesną składnię Compose spec:**
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M

```


* **Zabezpiecz kontener:** Tam gdzie to możliwe (np. usługi bezstanowe), uruchamiaj kontener w trybie read-only (`read_only: true`), używając `tmpfs` na foldery potrzebne do działania (cache). Upuść niepotrzebne uprawnienia roota: `cap_drop: [ALL]`.

### 2.5 Logi (Ochrona dysku)

* Domyślny driver logów w Dockerze (`json-file`) nie ma limitu wielkości — zatkany dysk to częsta awaria produkcji. Zawsze narzucaj ograniczenia per usługa lub globalnie w `/etc/docker/daemon.json`:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"

```



### 2.6 Cykl życia, healthchecki i zależności

* `restart: unless-stopped` to dobry punkt wyjścia, ale uwaga na pętle restartów zepsutej aplikacji.
* **Narzędzia PID 1:** W compose dodaj `init: true`, jeśli Twój obraz sam z siebie nie obsługuje poprawnie sygnałów zamknięcia.
* `depends_on: [baza]` nie poczeka, aż baza wstanie i zacznie przyjmować połączenia; poczeka tylko na uruchomienie procesu. Do prawidłowego oczekiwania używaj healthchecków w połączeniu z odpowiednim warunkiem:
```yaml
depends_on:
  db:
    condition: service_healthy

```


* Do definiowania gotowości używaj bloku `healthcheck` w Compose lub instrukcji `HEALTHCHECK` w Dockerfile.

### 2.7 Wolumeny

* **Named volumes** — dla danych perzystentnych, które muszą przetrwać restart kontenera (dane z DB).
* **Bind mounts** — dla synchronizacji plików z maszyną lokalną. W developmencie super mechanizm dla kodu; na produkcji używaj wyłącznie dla wgrywania zewnętrznej konfiguracji czy inicjalizacyjnych skryptów (np. `init.sql`).

---

## 3. Ekosystem i utrzymanie

* **Brak zdefiniowanego `.dockerignore` to strzał w kolano.** Zapobiega przesyłaniu plików takich jak `.git` czy `node_modules` do kontekstu builda.
* **Lintery to konieczność:** Używaj `hadolint`, aby sprawdzić poprawność składni Dockerfile w CI.
* **Analiza bezpieczeństwa i warstw:** Korzystaj z narzędzi takich jak **Trivy** czy **Docker Scout** w pipeline do łapania CVE, oraz **dive** do wizualizacji rozmiaru poszczególnych warstw.
* Zamiast ciągłego przebudowywania obrazu dla drobnych zmian w devie, zainteresuj się funkcjonalnością **`docker compose watch`**, która automatycznie synchronizuje katalogi z żyjącym kontenerem bez restartów i buildów.

---

## 4. Checklist przed merge

* [ ] Obraz bazowy jest mały, adekwatny do języka (`slim` dla apek, `alpine` dla binarów) i przypięty (digest + automatyzacja łatek)
* [ ] Kolejność warstw zoptymalizowana pod cache (manifest → instalacja → kopia kodu)
* [ ] Multi-stage build — produkcyjny kontener nie ma paczek developerskich/kompilatorów
* [ ] `USER` ustawiony i użyty odpowiednio `COPY --chown=<user>` — nic nie działa jako root
* [ ] `CMD` lub `ENTRYPOINT` używają formy tablicowej (exec form), by zagwarantować *graceful shutdown* (`init: true` w compose gdy trzeba)
* [ ] `.dockerignore` kompletny; obraz przeskanowany linterem (`hadolint`) i skanerem w poszukiwaniu podatności (np. `Trivy`)
* [ ] Brak sekretów w obrazie (zero hardkodów); obsługiwane przez Compose Secrets, Vault, etc.
* [ ] Zdefiniowane i włączone limity logów (`max-size`, `max-file`), żeby aplikacja nie wysyciła dysku serwera
* [ ] Limity zasobów (RAM/CPU) ustawione za pomocą współczesnego bloku `deploy.resources.limits`
* [ ] Sieci zaprojektowane minimalistycznie (bazy danych nie wystawiają portów na publicznego hosta)
* [ ] Gotowość i start w Compose obsługiwane przez `depends_on` + `condition: service_healthy` + `healthcheck`
* [ ] Wolumeny dobrane do intencji: named (dane), bind (dev/konfig), read_only container hardening (gdzie możliwe)