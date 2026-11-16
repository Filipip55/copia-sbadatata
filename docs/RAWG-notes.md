# Note sulle API RAWG

Appunti raccolti durante l'esplorazione delle API RAWG con Postman.
Servono come base per il contratto delle nostre API Django e per la documentazione tecnica.

> I conteggi riportati sono quelli osservati il 25/10/2026: il catalogo RAWG cambia nel tempo.

---

## Configurazione Postman

- **Workspace**: `Gaming Explorer`
- **Environment** `RAWG` con due variabili:
  - `base_url` = `https://api.rawg.io/api`
  - `rawg_key` = variabile *secret* non condivisa, salvata nel **Local Vault** (cifrata, resta solo sul computer di ciascuno)
- **Collection** `RAWG esplorazione`: autenticazione impostata a livello di collection
  (API Key, key = `key`, value = `{{rawg_key}}`, aggiunta ai Query Params).
  Le richieste la ereditano: la chiave non si riscrive mai nelle singole richieste.
- Ogni membro del gruppo crea il proprio Vault, usando lo **stesso nome di variabile** (`rawg_key`).
- **Prima di ogni commit** dell'export di collection/environment: aprire i JSON e verificare che la chiave non compaia.

---

## Anatomia di un URL

```
https://api.rawg.io/api/games?search=zelda&page_size=5
└──────── base_url ───────┘└─┬─┘└────────┬───────────┘
                           path     query string
```

- Il **path** indica la risorsa (`/games`).
- La **query string** (dopo `?`, coppie `nome=valore` separate da `&`) filtra o modifica la richiesta.
- `search` è un parametro di `/games`, non un endpoint:
  - `/search=zelda` → **404** (risorsa inesistente)
  - `/?search=zelda` → risposta vuota (radice dell'API, parametro ignorato)
  - `/games?search=zelda` → corretto

---

## GET /games

### Struttura della risposta

```json
{
  "count": 0,
  "next": "https://api.rawg.io/api/games?key=...&page=2",
  "previous": null,
  "results": [ ... ]
}
```

- `count`: numero **totale** di risultati della richiesta (non quelli ricevuti nella pagina).
- `next` / `previous`: URL della pagina successiva/precedente.
  **ATTENZIONE: contengono la chiave API in chiaro → Django non deve mai inoltrarli al frontend**,
  ma restituire solo numeri di pagina.
- `results`: array dei giochi della pagina corrente (dimensione controllata da `page_size`).

### Campi utili per la card (traccia IV.1.4)

| Campo RAWG | Uso | Note |
|---|---|---|
| `id`, `slug` | apertura del dettaglio | |
| `name` | titolo | |
| `background_image` | copertina | URL di `media.rawg.io` |
| `released` | data di pubblicazione | formato `AAAA-MM-GG` |
| `rating` | valutazione media | scala **0–5** (voti utenti RAWG) |
| `metacritic` | punteggio Metacritic | scala **0–100** (critica), **può essere `null`** |
| `parent_platforms` | piattaforme principali | famiglie (PlayStation, Xbox, PC…) |

- `rating` e `metacritic` hanno scale diverse: nell'interfaccia vanno presentati in modo da non confonderli.
- `platforms` elenca le piattaforme specifiche (PS4, PS5…), `parent_platforms` le famiglie: per la card sono più leggibili le famiglie.
- Campi pesanti e inutili per la card: `tags`, `stores`, `ratings`, `short_screenshots`.
  → motivo per cui Django restituirà al frontend una versione **sfoltita** della risposta.

---

## Ricerca per nome (`search`)

### Comportamento della ricerca standard

- È **fuzzy**: tollera errori di battitura.
  - `search=zeldaaa` → ~183 risultati, trova comunque i giochi di Zelda.
- Più parole **allargano** i risultati invece di restringerli (logica "o", non "e").
  - `search=zelda breath` → ~8500 risultati.
- I risultati sono ordinati per **pertinenza**: i primi sono comunque buoni anche con un totale enorme.
- Conseguenza: il `count` non indica "quanti giochi corrispondono davvero";
  serve per la paginazione ma non va messo in evidenza nell'interfaccia.

### Parametri di precisione

Confronto su `search=zelda breath`:

| Parametri | Risultati | Comportamento |
|---|---|---|
| nessuno | ~8500 | molto largo |
| `search_precise=true` | ~450 | intermedio |
| `search_exact=true` | 3 (Breath of the Wild, BotW Randomizer, BotW Starter Pack) | molto stretto |

**Decisione: DA PRENDERE.** Prove ancora da fare con ciascuna modalità:
- nome parziale (es. `zel`, `brea`), caso tipico della ricerca dinamica con debounce;
- errore di battitura (es. `zeldaaa`).

Criterio: la traccia (IV.1.2) chiede di cercare con "tutto o parte del nome".
Il parametro scelto verrà aggiunto **da Django**, non dal frontend:
Angular invia solo `search=...`, e cambiare modalità richiederà di modificare solo il backend.

### Ordinamento (`ordering`) combinato con la ricerca

- Valori: `name`, `-released`, `-rating`, `-metacritic` (il `-` indica ordine decrescente).
- **Verificato**: con `search=zelda breath&ordering=-rating` (ricerca standard) i giochi di Zelda
  **non compaiono tra i primi risultati**. L'ordinamento esplicito sostituisce quello per pertinenza,
  quindi giochi molto votati che corrispondono solo a "breath" passano davanti.
- **Implicazione di design**: durante una ricerca per nome, nessun ordinamento predefinito
  (si mantiene la pertinenza); l'ordinamento si applica solo se l'utente lo sceglie esplicitamente dai filtri.

---

## Da esplorare

- [ ] Prove di ricerca su nomi parziali ed errori → scelta tra standard / `search_precise` / `search_exact`
- [ ] `/genres` e filtro `genres` (accetta id, slug o entrambi?)
- [ ] `/platforms`, `/platforms/lists/parents`, filtri `platforms` e `parent_platforms`
- [ ] Filtro `dates` (formato `AAAA-MM-GG,AAAA-MM-GG`)
- [ ] Filtro `metacritic` (intervallo, es. `80,100`); esiste un filtro analogo per `rating`?
- [ ] `/games/{id}` e `/games/{slug}`: `description` vs `description_raw`, `developers`, `publishers`
- [ ] `/games/{id}/screenshots`
- [ ] Giochi con campi `null` (immagine, metacritic, data)
- [ ] Casi d'errore: chiave errata, id inesistente, pagina oltre la fine (status code?)
