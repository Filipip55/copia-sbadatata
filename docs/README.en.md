# Game Inn — Gaming Explorer

🇮🇹 [Leggi in italiano](../README.md)

Web app for exploring the world of video games, built by team **polpette sugose** for *Challenge – Episode 3 (Terranova Software – Gaming Explorer)*.

## What it does

- **Home** with a search bar and a selection of games.
- **Dynamic search** by name (debounced) and **advanced search** with filters for genre, platform, release year, rating and sort order.
- **Card grid** with cover, title, release date, rating and main platforms.
- **Detail page** with description, images and screenshots, genres, platforms, developer, publisher, user rating and critic score.
- **Favorites** and **Wishlist**, saved in the database for logged-in users and in the browser's localStorage for guests.
- Loading, error and "no results" states; **responsive** layout (desktop navbar, bottom navigation on mobile).
- **Bonus:** JWT registration/login with an account area, light/dark theme remembered across visits, wishlist separate from favorites, installable web app manifest (PWA).

## Architecture and choices

```
Angular (browser) ──/api──▶ Django REST ──▶ IGDB API
                                 └──────▶ PostgreSQL
```

| Choice | Why |
|---|---|
| **Django + Django REST Framework** instead of ASP.NET Core | The team is strongest in Python; DRF gives serializers, auth and a browsable API out of the box, and Django brings ORM, migrations and an admin panel. |
| **Angular 22** (standalone components, signals, new `@if`/`@for` syntax) | The framework suggested by the brief, used in its modern form; RxJS only where it helps (search debounce, HTTP). No NgRx: signals are enough for this app. |
| **Bootstrap 5.3** | Responsive layout with little CSS, and native dark mode via `data-bs-theme`. |
| **PostgreSQL** | Solid open-source RDBMS, first-class Django support, runs in one Docker container. |
| **IGDB instead of RAWG** | RAWG was down for several days during development, so we moved to IGDB (Twitch). It offers the same data; the critic score (`aggregated_rating`) takes the place of Metacritic. |
| **Django as a proxy** | API keys stay in the backend `.env` and never reach the browser. Games, genres and platforms are cached in the database: fewer calls against the rate limit, and if IGDB is unreachable the app keeps serving cached data. |
| **JWT (simplejwt)** with token blacklist | Stateless API auth; logout invalidates the refresh token. |
| **Docker Compose + Makefile** | All three of us (and you) get the same environment with one command, no local Python/Node install needed. |

## Getting started

**Requirements:** Linux (or macOS/WSL), Docker with the Compose v2 plugin (`docker compose`), `make`. Ports 4200, 8000 and 5432 must be free.

### 1. Create the `.env` file

```bash
make env          # copies .env.example to .env
```

Then open `.env` and fill in:

- **`POSTGRES_PASSWORD`** — any password you like.
- **`DJANGO_SECRET_KEY`** — generate one with:
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(50))"
  ```
  Paste it as is, **without quotes** (`DJANGO_SECRET_KEY=abc123...`). This generator only uses letters, digits, `-` and `_`; avoid keys containing `"`, `'`, `$` or `#`, which Docker Compose would misread.
- **`IGDB_CLIENT_ID`** and **`IGDB_CLIENT_SECRET`** — free credentials from Twitch:
  1. Log in to <https://dev.twitch.tv/console/apps> (the Twitch account needs two-factor authentication enabled).
  2. *Register Your Application*: any name, OAuth Redirect URL `http://localhost`, any category, client type *Confidential*.
  3. Open *Manage*: copy the **Client ID**, then click *New Secret* and copy the **Client Secret**.
- **`RAWG_API_KEY`** — no longer used, but it must exist: leave the placeholder value.

Leave the other values as they are. Again: no quotes around any value.

### 2. Start everything

```bash
make up
```

The first run builds the images and installs dependencies (a few minutes). Migrations are applied automatically. Then open:

- App: <http://localhost:4200>
- API: <http://localhost:8000/api/>

### Useful commands

| Command | Effect |
|---|---|
| `make` | list all commands |
| `make logs` | follow the logs (`SERVICE=backend` for one service) |
| `make down` | stop the containers (data is kept) |
| `make createsuperuser` | create a user for the admin panel at <http://localhost:8000/admin/> |
| `make test` | run the Django tests |
| `make reset` | **delete** all database data |
