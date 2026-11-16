FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /uvx /bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

ENV \
    # Il virtualenv vive FUORI da /app: il bind mount del codice non lo copre
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    # Usa il Python dell'immagine, non scaricarne un altro
    UV_PYTHON_DOWNLOADS=never \
    # Copia i file invece di creare link (la cache è su un altro filesystem)
    UV_LINK_MODE=copy \
    # I print/log di Django compaiono subito in "docker compose logs"
    PYTHONUNBUFFERED=1 \
    # Niente __pycache__ nella cartella montata dal vostro disco
    PYTHONDONTWRITEBYTECODE=1 \
    # Mette python e i pacchetti del venv nel PATH: niente "uv run" nel container
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY backend_django/ /app/backend_django/
WORKDIR /app/backend_django

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]
