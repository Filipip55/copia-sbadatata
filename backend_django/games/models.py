from datetime import datetime
from typing import Any

from django.db import models


class Genre(models.Model):
    """Game genre, a local cached copy of the IGDB genres."""

    id: int = models.PositiveIntegerField(primary_key=True)
    name: str = models.CharField(max_length=255)
    slug: str = models.CharField(max_length=255)
    cached_at: datetime = models.DateTimeField(auto_now=True)


class Platform(models.Model):
    """Gaming platform, a local cached copy of the IGDB platforms."""

    id: int = models.PositiveIntegerField(primary_key=True)
    name: str = models.CharField(max_length=255)
    slug: str = models.CharField(max_length=255)
    cached_at: datetime = models.DateTimeField(auto_now=True)


class Game(models.Model):
    """Game details, cached after the first request to IGDB.

    The id is the IGDB id. ``first_release_date`` is a Unix timestamp;
    the JSON fields (platforms, genres, screenshots...) hold data already
    normalized by ``IgdbClient``. ``cached_at`` tells when the record is
    stale and must be refreshed.
    """

    id: int = models.PositiveIntegerField(primary_key=True)
    slug: str = models.CharField(max_length=255)
    name: str = models.CharField(max_length=255)
    summary: str = models.TextField(null=True, blank=True)
    aggregated_rating: int = models.FloatField(null=True, blank=True)
    first_release_date: int = models.PositiveIntegerField(
        null=True, blank=True
    )
    cover_url: str = models.URLField(null=True, blank=True)
    platforms: Any = models.JSONField(default=list)
    genres: Any = models.JSONField(default=list)
    publishers: Any = models.JSONField(default=list)
    rating: float = models.FloatField(null=True, blank=True)
    screenshots: Any = models.JSONField(default=list)
    cached_at: datetime = models.DateTimeField(auto_now=True)
    artwork_urls: Any = models.JSONField(default=list)
    involved_companies: Any = models.JSONField(default=list)
