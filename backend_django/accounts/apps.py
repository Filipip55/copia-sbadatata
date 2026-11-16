from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """App config for user accounts and authentication."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
