from django.apps import AppConfig


class GamesConfig(AppConfig):
    """App config for the game catalog and the local cache of IGDB data."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'games'
