# Sessione di lavoro – RawgClient

## Postman

## RawgClient

## Prossimi passi

## Postman

Abbiamo configurato una Collection su Postman per esplorare le API di RAWG.

- Creata una variabile `base_url` con valore `https://api.rawg.io/api`.
- Creata una variabile `api_key` con la chiave ottenuta da rawg.io/apidocs.
- Configurata l'Authorization a livello di Collection come API Key (parametro `key`, valore `{{api_key}}`, aggiunto a Query Params).
- Per un problema di ereditarietà nella versione in uso, la key viene aggiunta tramite uno script nel tab **Before request** della Collection:

```js
pm.request.url.query.add(`key=${pm.collectionVariables.get("api_key")}`);
```

Endpoint esplorati:

- `GET /games` con parametri `search`, `search_precise`, `ordering`, `page`, `page_size`
- `GET /games/{id}` per il dettaglio di un gioco
- `GET /games/{id}/screenshots` per gli screenshot
- `GET /genres` e `GET /platforms` per i filtri

Notato che `/games/{id}` non include gli screenshot nel payload, solo il campo `screenshots_count`. Gli screenshot vanno recuperati con una chiamata separata.

## RawgClient

Abbiamo scritto il modulo `rawg_client.py` dentro l'app `games`. La classe `RawgClient` legge `RAWG_BASE_URL`, `RAWG_API_KEY` e `RAWG_TIMEOUT` da `settings.py`, usa una `requests.Session` per iniettare la API key automaticamente in ogni chiamata, e centralizza la logica HTTP nel metodo privato `_get` che chiama `raise_for_status()` prima di restituire il JSON.

Metodi implementati:

- `list_games(search, page, page_size, filters)` — chiama `GET /games`, filtra i campi con `METADATA["search"]`
- `get_game(id)` — chiama `GET /games/{id}`, filtra i campi con `METADATA["game"]`
- `list_game_screenshots(id)` — chiama `GET /games/{id}/screenshots`, restituisce `results`
- `list_filters(filter_type)` — chiama `GET /genres` o `GET /platforms`, filtra i campi con `METADATA["base_filters"]`

I campi utili sono centralizzati nel dizionario `METADATA` con tre chiavi: `game`, `search`, `base_filters`.

Decisioni tecniche rilevanti:

- `filters` ha default `None` invece di `{}` per evitare il problema del mutable default argument in Python.
- I params base e i filtri vengono uniti con l'operatore `|` tra dizionari.
- `_get` accetta `params=None` per supportare chiamate senza parametri aggiuntivi (es. `get_game`).

## Prossimi passi

- Progettare il modello Django per la cache dei giochi nell'app `games`.
- Scrivere le views DRF che fanno da intermediario tra Angular e il `RawgClient`, con logica cache-first.
- Collegare gli URL in `games/urls.py` e includerli in `config/urls.py`.
