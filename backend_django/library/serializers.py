from rest_framework import serializers

from games.models import Game

from .models import UserLibrary


class LibraryGameSerializer(serializers.ModelSerializer):
    """Lightweight game representation for personal lists.

    Holds only the fields the game card needs (no screenshots,
    artworks, publishers...).
    """

    class Meta:
        model = Game
        fields = [
            "id",
            "slug",
            "name",
            "cover_url",
            "rating",
            "aggregated_rating",
            "first_release_date",
            "platforms",
            "genres",
        ]


class UserLibrarySerializer(serializers.ModelSerializer):
    """Personal list entry, with the game nested in its lightweight form."""

    game = LibraryGameSerializer(read_only=True)

    class Meta:
        model = UserLibrary
        fields = [
            "list_type",
            "game",
            "added_at",
        ]
        read_only_fields = [
            "added_at",
        ]
