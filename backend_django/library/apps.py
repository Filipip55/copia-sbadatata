from django.apps import AppConfig


class LibraryConfig(AppConfig):
    """App config for users' personal lists (favorites and wishlist)."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'library'
