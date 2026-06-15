# =========================================================================
# Bazowy etap - wspólny dla dev i prod.
# Instalujemy zależności (w tym gunicorn) i kopiujemy kod aplikacji.
# =========================================================================
FROM python:3.13-slim AS base
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3001

# =========================================================================
# Etap DEV - wbudowany serwer developerski Flask (auto-reload przy `watch`).
# NIE używać na produkcji: jest jednowątkowy i niewydajny.
# Budowane przez: docker build --target dev
# =========================================================================
FROM base AS dev
CMD ["python", "src/run.py"]

# =========================================================================
# Etap PROD - produkcyjny serwer WSGI Gunicorn.
# Gunicorn importuje obiekt `app` z modułu `run` (src/run.py).
# Forma shell ("sh -c") pozwala podstawić zmienne $PORT / $GUNICORN_WORKERS.
# Budowane przez: docker build --target prod
# =========================================================================
FROM base AS prod
ENV GUNICORN_WORKERS=4
CMD ["sh", "-c", "gunicorn --chdir src --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS} run:app"]
