# Game Inn — Gaming Explorer

🇬🇧 [Read in English](docs/README.en.md)

Web app per esplorare il mondo dei videogiochi, realizzata dal team **polpette sugose** per la *Challenge – Episode 3 (Terranova Software – Gaming Explorer)*.

## Cosa fa

- **Home** con barra di ricerca e una selezione di giochi.
- **Ricerca dinamica** per nome (con debounce) e **ricerca avanzata** con filtri per genere, piattaforma, anno di uscita, valutazione e ordinamento.
- **Griglia di card** con copertina, titolo, data di uscita, valutazione e piattaforme principali.
- **Scheda di dettaglio** con descrizione, immagini e screenshot, generi, piattaforme, sviluppatore, publisher, valutazione degli utenti e punteggio della critica.
- **Preferiti** e **Wishlist**, salvati nel database per gli utenti registrati e nel localStorage del browser per gli ospiti.
- Stati di caricamento, errore e "nessun risultato"; layout **responsive** (navbar su desktop, navigazione in basso su smartphone).
- **Bonus:** registrazione/login con JWT e area personale, tema chiaro/scuro ricordato tra un accesso e l'altro, wishlist distinta dai preferiti, manifest per installare l'app (PWA).

## Architettura e scelte

```
Angular (browser) ──/api──▶ Django REST ──▶ API IGDB
                                 └──────▶ PostgreSQL
```

| Scelta | Perché |
|---|---|
| **Django + Django REST Framework** al posto di ASP.NET Core | Il team è più forte in Python; DRF offre serializer, autenticazione e API navigabile già pronti, Django porta ORM, migrazioni e pannello admin. |
| **Angular 22** (componenti standalone, signals, sintassi `@if`/`@for`) | Il framework suggerito dalla traccia, nella sua forma moderna; RxJS solo dove serve (debounce della ricerca, HTTP). Niente NgRx: i signals bastano. |
| **Bootstrap 5.3** | Layout responsive con poco CSS e dark mode nativa con `data-bs-theme`. |
| **PostgreSQL** | RDBMS open source solido, ottimo supporto in Django, gira in un solo container Docker. |
| **IGDB al posto di RAWG** | RAWG è rimasta irraggiungibile per diversi giorni durante lo sviluppo, quindi siamo passati a IGDB (Twitch). Offre gli stessi dati; il punteggio della critica (`aggregated_rating`) sostituisce Metacritic. |
| **Django come proxy** | Le chiavi API restano nel `.env` del backend e non arrivano mai al browser. Giochi, generi e piattaforme sono messi in cache nel database: meno chiamate rispetto al limite di richieste e, se IGDB non risponde, l'app continua a servire i dati in cache. |
| **JWT (simplejwt)** con blacklist dei token | Autenticazione stateless per le API; il logout invalida il refresh token. |
| **Docker Compose + Makefile** | Tutti e tre noi (e voi) abbiamo lo stesso ambiente con un solo comando, senza installare Python o Node in locale. |

## Come avviarlo

**Requisiti:** Linux (o macOS/WSL), Docker con il plugin Compose v2 (`docker compose`), `make`. Le porte 4200, 8000 e 5432 devono essere libere.

### 1. Creare il file `.env`

```bash
make env          # copia .env.example in .env
```

Poi aprite `.env` e compilate:

- **`POSTGRES_PASSWORD`** — una password a piacere.
- **`DJANGO_SECRET_KEY`** — generatela con:
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(50))"
  ```
  Incollatela così com'è, **senza virgolette** (`DJANGO_SECRET_KEY=abc123...`). Questo generatore usa solo lettere, cifre, `-` e `_`; evitate chiavi con `"`, `'`, `$` o `#`, che Docker Compose interpreterebbe male.
- **`IGDB_CLIENT_ID`** e **`IGDB_CLIENT_SECRET`** — credenziali gratuite di Twitch:
  1. Accedete a <https://dev.twitch.tv/console/apps> (l'account Twitch deve avere l'autenticazione a due fattori attiva).
  2. *Register Your Application*: nome qualsiasi, OAuth Redirect URL `http://localhost`, categoria qualsiasi, client type *Confidential*.
  3. Aprite *Manage*: copiate il **Client ID**, poi cliccate *New Secret* e copiate il **Client Secret**.
- **`RAWG_API_KEY`** — non è più usata ma deve esistere: lasciate il valore segnaposto.

Gli altri valori vanno bene così. Di nuovo: nessun valore tra virgolette.

### 2. Avviare tutto

```bash
make up
```

Il primo avvio costruisce le immagini e installa le dipendenze (qualche minuto). Le migrazioni vengono applicate in automatico. Poi aprite:

- App: <http://localhost:4200>
- API: <http://localhost:8000/api/>

### Comandi utili

| Comando | Effetto |
|---|---|
| `make` | elenco di tutti i comandi |
| `make logs` | segue i log (`SERVICE=backend` per un solo servizio) |
| `make down` | ferma i container (i dati restano) |
| `make createsuperuser` | crea un utente per il pannello admin su <http://localhost:8000/admin/> |
| `make test` | esegue i test Django |
| `make reset` | **cancella** tutti i dati del database |
