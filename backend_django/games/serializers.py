from rest_framework import serializers

from .models import Game, Genre, Platform


class GenreSerializer(serializers.ModelSerializer):
    """Genre as exposed by the API (without ``cached_at``)."""

    class Meta:
        model = Genre
        fields = [
            "id",
            "name",
            "slug",
        ]


class PlatformSerializer(serializers.ModelSerializer):
    """Platform as exposed by the API (without ``cached_at``)."""

    class Meta:
        model = Platform
        fields = [
            "id",
            "name",
            "slug",
        ]


class GameSerializer(serializers.ModelSerializer):
    """Full game details, used by the game detail page."""

    class Meta:
        model = Game
        fields = [
            "id",
            "slug",
            "name",
            "summary",
            "aggregated_rating",
            "first_release_date",
            "cover_url",
            "platforms",
            "genres",
            "publishers",
            "rating",
            "screenshots",
            "cached_at",
            "artwork_urls",
            "involved_companies",
        ]
