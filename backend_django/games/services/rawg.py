import typing

import requests
from django.conf import settings

METADATA = {
    "game": {
        "id",
        "slug",
        "name",
        "description",
        "metacritic",
        "released",
        "tba",
        "updated",
        "background_image",
        "ratings",
        "playtime",
        "metacritic_url",
        "parent_platforms",
        "platforms",
        "stores",
        "genres",
        "tags",
        "publishers",
        "rating",
        "esrb_rating",
    },
    "search": {
        "slug",
        "name",
        "playtime",
        "platforms",
        "released",
        "tba",
        "background_image",
        "rating",
        "metacritic",
        "id",
        "parent_platforms",
        "genres",
    },
    "base_filters": {
        "id",
        "name",
        "slug",
    }
}


class RawgClient:
    """Client for the RAWG REST API.

    Exposes the same interface as ``IgdbClient``; responses are trimmed
    to the fields listed in ``METADATA``.
    """

    def __init__(self) -> None:
        """Set up an HTTP session that sends the API key with every request."""
        self.base_url = settings.RAWG_BASE_URL
        self.timeout = settings.RAWG_TIMEOUT
        self.session = requests.Session()
        self.session.params = {
            "key": settings.RAWG_API_KEY
        }

    def _get(
        self,
        path: str,
        params: dict[str, typing.Any] | None = None
    ) -> dict[str, typing.Any]:
        """Send a GET to ``base_url + path`` and return the decoded JSON.

        Raises:
            requests.HTTPError: If RAWG responds with an error status.
        """
        params = params or {}
        response = self.session.get(
            url=self.base_url + path,
            params=params,
            timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()

    def list_games(
            self,
            search: str,
            page: int = 1,
            page_size: int = 10,
            filters: dict[str, str] | None = None
        ) -> dict[str, list[dict[str, typing.Any]] | int]:
        """Search games by name, with pagination and optional filters.

        Args:
            search: Text to search for (precise search).
            page: Page number, starting from 1.
            page_size: Results per page.
            filters: Extra query params passed as-is to RAWG
                (e.g. ``{"genres": "action"}``).

        Returns:
            ``{"results": [...], "count": n}`` where ``count`` is the total.
        """
        filters = filters or {}
        params = {
            "search": search,
            "search_precise": "true",
            "page": page,
            "page_size": page_size
        } | filters

        response = self._get(
            path="/games",
            params=params
        )

        useful_data = [
            {k: v for k, v in game.items() if k in METADATA["search"]}
            for game in response['results']
        ]
        return {
            "results": useful_data,
            "count": response["count"]
        }

    def get_game(
            self,
            game_id: int
        ) -> dict[str, typing.Any]:
        """Return a game's details, trimmed to the ``METADATA["game"]`` fields."""
        response = self._get(
            path=f"/games/{game_id}"
        )
        useful_data = {
            k: v for k, v in response.items() if k in METADATA["game"]
        }

        return useful_data

    def list_game_screenshots(
            self,
            game_id: int
        ) -> list[dict[str, typing.Any]]:
        """Return the game's screenshots exactly as RAWG provides them."""
        response = self._get(
            path=f"/games/{game_id}/screenshots"
        )
        return response["results"]

    def list_filters(
            self,
            filter_type: str | None = None
        ) -> list[dict[str, typing.Any]]:
        """Return the list of genres or platforms (id, name, slug).

        Raises:
            ValueError: If ``filter_type`` is not "genres" or "platforms".
        """
        if filter_type is None or filter_type not in ("genres", "platforms"):
            raise ValueError(
                "filter_type must be a valid string."
            )

        response = self._get(
            path=f"/{filter_type}"
        )

        filterd = [
            {k: v for k, v in e.items() if k in METADATA["base_filters"]}
            for e in response["results"]
        ]
        return filterd
