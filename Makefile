.PHONY: help env up up-fg down restart build logs ps psql reset clean server \
	    migrate makemigrations manage shell createsuperuser loaddata test \
	    front-init ng npm
 
.DEFAULT_GOAL := help
 
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"
 
# Utente con cui girano i container, in modo che i file creati restino nostri.
# - Docker "classico" (demone di root): usiamo il nostro uid/gid.
# - Docker rootless: il "root" del container corrisponde GIÀ al nostro utente sul PC,
#   e un altro uid finirebbe fuori dagli id mappati (errore "chown /dev/stdout").
ifneq (,$(findstring rootless,$(shell docker info -f '{{.SecurityOptions}}' 2>/dev/null)))
export HOST_UID := 0
export HOST_GID := 0
else
export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)
endif
 
COMPOSE := docker compose
# "run --rm" crea un container temporaneo: funziona anche se i servizi sono spenti
MANAGE  := $(COMPOSE) run --rm backend python manage.py
NODE    := $(COMPOSE) run --rm --no-deps frontend
 
help:   ## mostra questo elenco
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
	    awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
 
# ---------- Ambiente ----------
 
env:    ## crea il .env partendo da .env.example (se non esiste)
	@test -f .env && printf $(YELLOW)".env esiste già, non lo tocco\n"$(RESET) \
	    || (cp .env.example .env && printf $(GREEN)"Creato .env: inserite i valori reali!\n"$(RESET))
 
up:     ## avvia tutto in background e attende che sia pronto
	$(COMPOSE) up -d --build --wait
	@printf $(GREEN)"Frontend: http://localhost:4200  -  Backend: http://localhost:8000\n"$(RESET)
 
up-fg:  ## avvia tutto in primo piano, con i log a schermo (Ctrl+C ferma tutto)
	$(COMPOSE) up --build
 
down:   ## ferma i container (i dati restano)
	$(COMPOSE) down
 
restart: ## riavvia un servizio, es: make restart SERVICE=backend (vuoto = tutti)
	$(COMPOSE) restart $(SERVICE)
 
build:  ## ricostruisce l'immagine del backend (dopo "uv add" / cambio dipendenze)
	$(COMPOSE) build backend
 
logs:   ## segue i log, es: make logs SERVICE=db (vuoto = tutti; Ctrl+C per uscire)
	$(COMPOSE) logs -f $(SERVICE)
 
ps:     ## stato dei container
	$(COMPOSE) ps
 
# ---------- Database ----------
 
psql:   ## console SQL dentro il container
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'
 
reset:  ## ATTENZIONE: cancella tutti i dati del database
	@printf $(RED)"Cancello TUTTI i dati del database. Sicuri? [s/N] "$(RESET); \
	    read ans; [ "$$ans" = "s" ] || (echo "Annullato." && exit 1)
	$(COMPOSE) down -v
 
clean:  ## come reset, e in più rimuove le immagini (Postgres, Node e quella del backend)
	@printf $(RED)"Cancello dati del database e immagini Docker. Sicuri? [s/N] "$(RESET); \
	    read ans; [ "$$ans" = "s" ] || (echo "Annullato." && exit 1)
	$(COMPOSE) down -v --rmi all
 
# ---------- Django (nel container) ----------
 
migrate: ## applica le migrazioni
	$(MANAGE) migrate
 
makemigrations: ## crea le migrazioni dopo aver modificato i models
	$(MANAGE) makemigrations
 
manage: ## qualsiasi comando di manage.py, es: make manage ARGS="showmigrations"
	$(MANAGE) $(ARGS)
 
shell:  ## shell Python di Django
	$(MANAGE) shell
 
createsuperuser: ## crea un utente admin
	$(MANAGE) createsuperuser
 
loaddata: ## carica i dati di prova (games/fixtures/mockup_data.json)
	$(MANAGE) loaddata mockup_data
 
test:   ## esegue i test Django
	$(MANAGE) test
 
# Vecchio modo, utile per il debug con VS Code. Richiede "make down" prima
# (porta 8000 occupata) e "docker compose up -d db" per avere il database.
server: ## avvia Django in LOCALE con uv, fuori da Docker
	uv run python3 ./backend_django/manage.py runserver
 
# ---------- Angular (nel container) ----------
 
front-init: ## crea il progetto Angular in frontend/ (solo la prima volta!)
	@test ! -f frontend/package.json || (printf $(YELLOW)"frontend/ contiene già un progetto Angular\n"$(RESET) && exit 1)
	$(NODE) npx -y @angular/cli@latest new gaming-explorer --directory . --style=scss --ssr=false --skip-git
 
ng:     ## comando Angular CLI, es: make ng ARGS="generate component pages/home"
	$(NODE) npx ng $(ARGS)
 
npm:    ## comando npm, es: make npm ARGS="install bootstrap"
	$(NODE) npm $(ARGS)
