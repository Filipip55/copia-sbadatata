from django.contrib.auth import get_user_model
from django.db import models

from games.models import Game

User = get_user_model()


class UserLibrary(models.Model):
    """A game in one of a user's personal lists (favorites or wishlist)."""

    class ListType(models.TextChoices):
        FAVORITES = "favorites", "Favorites"
        WISHLIST = "wishlist", "Wishlist"

    list_type = models.CharField(
        max_length=20,
        choices=ListType.choices
    )
    user = models.ForeignKey(
        to=User, on_delete=models.CASCADE
    )
    game = models.ForeignKey(
        to=Game, on_delete=models.CASCADE
    )
    added_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        unique_together = (
            "user",
            "game",
            "list_type"
        )
