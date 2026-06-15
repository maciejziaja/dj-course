WAŻNE 😅

1. Niektóre extension z VSCode przestały działać pod cursorem 😅 dlatego zalecane otwarcie w VSCode
2. extension - devcontainers, oficjalne
3. koniecznie otwórz w folderze `wms-api` - otwarcie w folderze wyżej "popsuje" ścieżki devcontainerowi
4. upewnij się aby - jeśli wcześniej miałeś/aś zbudowany obraz dla `wms-api` - aby go usunąć.
5. pierwsza budowa obrazu może potrwać - to normalne 😉
6. enjoy
7. profit

---

## Serwer produkcyjny (Gunicorn) i profile Compose

### Jak uruchomić
Dev (serwer Flaska + auto-reload kodu):
```bash
docker compose --profile dev up --build
```

Prod (Gunicorn):
```bash
docker compose --profile prod up --build
```

Uwaga: bez `--profile` serwis API w ogóle się nie uruchomi (wystartują tylko
Postgres, nginx i pgAdmin) - to celowe, profil trzeba wybrać świadomie.

### Jak sprawdzić, że działa
```bash
curl http://localhost:3001/health   # bezpośrednio do API
curl http://localhost/health        # przez nginx (port 80)
```
W logach profilu `prod` zobaczysz `Starting gunicorn` i kilka workerów,
a w profilu `dev` ostrzeżenie "development server".

### Liczba workerów
Domyślnie 4 (zmienna `GUNICORN_WORKERS` w serwisie `wms-api-prod`).
Typowa rekomendacja to `2 * liczba_rdzeni + 1`.
