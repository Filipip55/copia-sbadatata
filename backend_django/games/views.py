from datetime import timedelta
from typing import Any

import requests
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.status import HTTP_503_SERVICE_UNAVAILABLE
from rest_framework.views import APIView

from .models import Game, Genre, Platform
from .serializers import GameSerializer, GenreSerializer, PlatformSerializer
from .services import IgdbClient

igdb_client = IgdbClient()

FILTER_KEYS = (
    "platforms",
    "genres",
)


class GameSearch(APIView):
    """Game search with pagination and filters.

    GET /api/games/?search=zelda&page=1&page_size=40&genres=..&platforms=..
        &dates=YYYY-MM-DD,YYYY-MM-DD&metacritic=min,max

    Queries IGDB; if IGDB is unreachable, falls back to the games already
    cached in the local database.
    """

    permission_classes = [AllowAny]

    def _validate_pagination(self, request: Request) -> tuple[int, int]:
        """Read ``page`` and ``page_size`` (max 40) from the query params; 400 if invalid."""
        try:
            page = int(request.query_params.get("page", "1"))
            page_size = int(request.query_params.get("page_size", "40"))
        except ValueError as exc:
            raise ValidationError(
                "page and page_size must be integers."
            ) from exc

        if page <= 0 or page_size <= 0:
            raise ValidationError(
                "page and page_size must be greater than zero."
            )

        if page_size > 40:
            raise ValidationError(
                "page_size must not exceed 40."
            )

        return page, page_size

    def _build_filters(self, request: Request) -> dict[str, str]:
        """Collect the non-empty filters from the query params, in the client's format."""
        filters: dict[str, str] = {}

        for key in FILTER_KEYS:
            value = request.query_params.get(key)
            if value:
                filters[key] = value

        # dates: the user passes "2020-01-01,2020-12-31";
        # the conversion to Unix timestamps happens in the client
        dates = request.query_params.get("dates", "")
        if dates:
            filters["dates"] = dates

        metacritic = request.query_params.get("metacritic", "")
        if metacritic:
            filters["metacritic"] = metacritic

        return filters

    def _search_local(
        self,
        search: str,
        page: int,
        page_size: int,
        filters: dict[str, str],
    ) -> dict[str, list[dict[str, object]] | int]:
        """Fallback search over the cached games, used when IGDB is down.

        Here ``genres`` and ``platforms`` are matched against the slug, and
        the ``dates`` filter is ignored. Returns the same shape as
        ``IgdbClient.list_games``.
        """
        games = Game.objects.all()

        if search:
            games = games.filter(name__icontains=search)

        if "genres" in filters:
            games = games.filter(
                genres__contains=[{"slug": filters["genres"]}]
            )

        if "platforms" in filters:
            games = games.filter(
                platforms__contains=[{"slug": filters["platforms"]}]
            )

        if "metacritic" in filters:
            try:
                minimum, maximum = map(
                    int, filters["metacritic"].split(",")
                )
                games = games.filter(
                    aggregated_rating__range=(minimum, maximum)
                )
            except ValueError as exc:
                raise ValidationError(
                    "metacritic must contain two integers separated by a comma."
                ) from exc

        count = games.count()

        start = (page - 1) * page_size
        end = start + page_size
        games = games[start:end]

        results = [
            {
                "id": game.id,
                "slug": game.slug,
                "name": game.name,
                "platforms": game.platforms,
                "first_release_date": game.first_release_date,
                "cover_url": game.cover_url,
                "rating": game.rating,
                "aggregated_rating": game.aggregated_rating,
                "genres": game.genres,
                "artwork_urls": game.artwork_urls
            }
            for game in games
        ]

        return {
            "count": count,
            "results": results,
        }

    def get(
        self,
        request: Request,
    ) -> Response:
        """Return ``{"count", "results"}`` from IGDB, or from the database as a fallback."""
        search = request.query_params.get("search", "")
        page, page_size = self._validate_pagination(request)
        filters = self._build_filters(request)

        try:
            response = igdb_client.list_games(
                search=search,
                page=page,
                page_size=page_size,
                filters=filters,
            )
        except requests.exceptions.RequestException:
            response = self._search_local(
                search=search,
                page=page,
                page_size=page_size,
                filters=filters,
            )

        return Response(data=response)


class BaseFilterView(APIView):
    """Base view for the filter lists (genres, platforms).

    The lists are cached in the database and fetched again from IGDB when
    the table is empty or the oldest record is more than 10 days old.
    Subclasses set ``model``, ``serializer`` and ``filter_type``.
    """

    model = None
    serializer = None
    filter_type = ""

    permission_classes = [AllowAny]

    def _cache_and_serialize(
        self,
        filters: list[dict[str, Any]]
    ) -> Any:
        """Replace the cache with the given filters and return them serialized."""
        self.model.objects.all().delete()
        self.model.objects.bulk_create(
            self.model(**f) for f in filters
        )
        filters = self.model.objects.all()
        data = self.serializer(filters, many=True).data
        return data

    def get(
        self,
        request: Request,
    ) -> Response:
        """Return the list, refreshing the cache first if it is empty or stale.

        If IGDB fails, return whatever is in the cache (possibly empty).
        """
        needs_update = False

        if not self.model.objects.exists():
            needs_update = True
        else:
            filtr = self.model.objects.order_by("cached_at").first()
            if filtr and (
                timezone.now() - timedelta(days=10) > filtr.cached_at
            ):
                needs_update = True

        if needs_update:
            try:
                filters = igdb_client.list_filters(
                    filter_type=self.filter_type
                )
                data = self._cache_and_serialize(filters=filters)
            except Exception:
                filters = self.model.objects.all()
                data = self.serializer(filters, many=True).data
        else:
            filters = self.model.objects.all()
            data = self.serializer(filters, many=True).data

        return Response(data=data)


class GenresRequest(BaseFilterView):
    """GET the list of genres."""

    permission_classes = [AllowAny]
    model = Genre
    serializer = GenreSerializer
    filter_type = "genres"


class PlatformsRequest(BaseFilterView):
    """GET the list of platforms."""

    permission_classes = [AllowAny]
    model = Platform
    serializer = PlatformSerializer
    filter_type = "platforms"


class GameDetail(APIView):
    """Game details: GET /api/games/<game_id>/."""

    permission_classes = [AllowAny]

    def get(
        self,
        request: Request,
        game_id: int,
    ) -> Response:
        """Return the game from the cache, refreshing it from IGDB if missing or stale.

        The details (screenshots included) are saved to the database. If IGDB
        is down the cached copy is used; if there is none, respond 503.
        """
        game = Game.objects.filter(id=game_id).first()
        needs_fetch = False

        if not game:
            needs_fetch = True
        elif timezone.now() - timedelta(days=10) > game.cached_at:
            needs_fetch = True

        if needs_fetch:
            try:
                detail = igdb_client.get_game(
                    game_id=game_id
                )
                screenshots = igdb_client.list_game_screenshots(
                    game_id=game_id
                )
                detail["screenshots"] = screenshots

                Game.objects.update_or_create(id=game_id, defaults=detail)
                game = Game.objects.filter(id=game_id).first()

            except Exception as e:
                print(
                    f"[WARNING] IGDB down while fetching game {game_id}: {e}."
                )
                import traceback
                traceback.print_exc()
                if not game:
                    return Response(
                        {"error": "Game not found in DB, IGDB API is down."},
                        status=HTTP_503_SERVICE_UNAVAILABLE
                    )

        data = GameSerializer(game, many=False).data
        return Response(data=data)
