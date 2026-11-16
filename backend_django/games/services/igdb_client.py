import time
import typing

import requests
from django.conf import settings


def _build_image_url(partial_url: str, size: str = "t_cover_big") -> str:
    """Turn a partial IGDB image URL into a full one with the given size.

    IGDB returns partial URLs such as:
    //images.igdb.com/igdb/image/upload/t_thumb/abc123.jpg

    Useful sizes:
    - t_thumb         (90x128)
    - t_cover_small   (90x128)
    - t_cover_big     (264x374)  ← covers in result lists
    - t_screenshot_med (569x320) ← screenshot
    - t_1080p         (1920x1080)
    """
    if not partial_url:
        return ""
    url = partial_url.replace("//", "https://")
    url = url.replace("t_thumb", size)
    return url


METADATA = {
    "game": {
        "id",
        "slug",
        "name",
        "summary",            # = description in RAWG
        "rating",             # IGDB rating (0-100, user average)
        "aggregated_rating",  # = metacritic in RAWG (critic average)
        "first_release_date",
        "cover",             # object with a url
        "artworks",          # list of objects with a url (extra images)
        "genres",
        "platforms",
        "involved_companies",
    },
    "search": {
        "id",
        "slug",
        "name",
        "rating",
        "aggregated_rating",
        "first_release_date",
        "cover",
        "genres",
        "platforms",
        "artworks",
    },
    "base_filters": {
        "id",
        "name",
        "slug",
    }
}


class IgdbClient:
    """Client for the IGDB API (v4), authenticated through Twitch OAuth.

    The token is requested on the first call and renewed when it expires.
    Public methods share ``RawgClient``'s interface and return data already
    normalized for the frontend (``cover_url``, ``artwork_urls``...).
    """

    def __init__(self) -> None:
        """Read credentials from settings; the token is not requested yet."""
        self.base_url = settings.IGDB_BASE_URL  # "https://api.igdb.com/v4"
        self.timeout = settings.IGDB_TIMEOUT
        self.client_id = settings.IGDB_CLIENT_ID
        self.client_secret = settings.IGDB_CLIENT_SECRET
        self.session = requests.Session()
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    # ------------------------------------------------------------------ #
    #  Auth                                                                #
    # ------------------------------------------------------------------ #

    def _fetch_token(self) -> None:
        """Request a new OAuth token from Twitch."""
        response = requests.post(
            url="https://id.twitch.tv/oauth2/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "client_credentials",
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        self._token = data["access_token"]
        # expires_in is in seconds; subtract a 60s safety margin
        self._token_expires_at = time.time() + data["expires_in"] - 60

    def _ensure_token(self) -> None:
        """Renew the token only if it is missing or expired."""
        if self._token is None or time.time() >= self._token_expires_at:
            self._fetch_token()

    def _get_headers(self) -> dict[str, str]:
        """Return the auth headers, renewing the token if needed."""
        self._ensure_token()
        return {
            "Client-ID": self.client_id,
            "Authorization": f"Bearer {self._token}",
        }

    # ------------------------------------------------------------------ #
    #  HTTP                                                                #
    # ------------------------------------------------------------------ #

    def _post(
        self,
        path: str,
        body: str,
    ) -> typing.Any:
        """Send a POST with an Apicalypse (plain text) body and return the JSON.

        IGDB always uses POST, even for reads. The response is usually a
        list; for ``/count`` endpoints it is a ``{"count": n}`` dict.

        Raises:
            requests.HTTPError: If IGDB (or Twitch, for the token) responds
                with an error status.
        """
        response = self.session.post(
            url=self.base_url + path,
            headers=self._get_headers(),
            data=body,          # body is a plain string, not JSON
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    # ------------------------------------------------------------------ #
    #  Helpers Apicalypse                                                  #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _build_count_query(
        search: str | None = None,
        where: str | None = None,
    ) -> str:
        """Build the body for ``/count``: only ``search`` and ``where``, no fields."""
        parts = []

        if search:
            parts.append(f'search "{search}";')

        if where:
            parts.append(f"where {where};")

        return " ".join(parts)

    @staticmethod
    def _build_query(
        fields: list[str],
        search: str | None = None,
        where: str | None = None,
        limit: int = 10,
        offset: int = 0,
        sort: str | None = None,
    ) -> str:
        """Build an Apicalypse query string.

        Example output:
            fields name, rating, cover.url; search "Zelda"; limit 10; offset 0;
        """
        parts = [f"fields {', '.join(fields)};"]
        if search:
            parts.append(f'search "{search}";')
        if where:
            parts.append(f"where {where};")
        if sort:
            parts.append(f"sort {sort};")
        parts.append(f"limit {limit};")
        parts.append(f"offset {offset};")
        return " ".join(parts)

    # ------------------------------------------------------------------ #
    #  Public API — same interface as RawgClient                         #
    # ------------------------------------------------------------------ #

    def list_games(
        self,
        search: str,
        page: int = 1,
        page_size: int = 40,
        filters: dict[str, str] | None = None,
    ) -> dict[str, list[dict[str, typing.Any]] | int]:
        """Search games by name, with pagination and optional filters.

        Makes two calls: one to ``/games/count`` for the total and one to
        ``/games`` for the requested page. Records without a name are dropped.

        Args:
            search: Text to search for.
            page: Page number, starting from 1.
            page_size: Results per page.
            filters: Optional filters, all as strings:
                ``genres`` / ``platforms`` (comma-separated IGDB ids),
                ``dates`` ("YYYY-MM-DD,YYYY-MM-DD"),
                ``metacritic`` ("min,max" on aggregated_rating).

        Returns:
            ``{"results": [...], "count": n}``; each result has ``cover_url``
            and ``artwork_urls`` instead of ``cover``/``artworks``.

        Raises:
            ValueError: If ``dates`` or ``metacritic`` are malformed.
            requests.RequestException: If IGDB is unreachable or responds
                with an error.
        """
        filters = filters or {}
        offset = (page - 1) * page_size

        # Build the "where" clause from the optional filters
        where_clauses = []
        if "genres" in filters:
            where_clauses.append(
                f"genres = ({filters['genres']})"
            )
        if "platforms" in filters:
            where_clauses.append(
                f"platforms = ({filters['platforms']})"
            )
        if "dates" in filters:
            from datetime import datetime
            start, end = filters["dates"].split(",")
            start_ts = int(datetime.strptime(
                start.strip(), "%Y-%m-%d").timestamp()
            )
            end_ts = int(
                datetime.strptime(end.strip(), "%Y-%m-%d").timestamp()
            )
            where_clauses.append(
                f"first_release_date >= {start_ts} "
                f"& first_release_date <= {end_ts}"
            )
        if "metacritic" in filters:
            min_val, max_val = filters["metacritic"].split(",")
            where_clauses.append(
                f"aggregated_rating >= {min_val.strip()} "
                f"& aggregated_rating <= {max_val.strip()}"
            )

        where = " & ".join(where_clauses) if where_clauses else None

        # Total number of results
        count_body = self._build_count_query(
            search=search,
            where=where,
        )

        count_response = self._post("/games/count", count_body)
        count = count_response["count"]

        body = self._build_query(
            fields=list(METADATA["search"]) + [
                "cover.url",
                "artworks.url"
            ],
            search=search,
            where=where,
            limit=page_size,
            offset=offset,
        )

        results = self._post("/games", body)

        useful_data = []
        for game in results:
            name = game.get("name")
            # Skip corrupted or placeholder records without a name
            if not name or not isinstance(name, str) or not name.strip():
                continue

            entry = {
                k: v for k, v in game.items()
                if k in METADATA["search"]
            }

            # Guarantee types and default values for the frontend
            entry.setdefault("slug", "")
            entry.setdefault("rating", None)
            entry.setdefault("aggregated_rating", None)
            entry.setdefault("first_release_date", None)
            entry.setdefault("genres", [])
            entry.setdefault("platforms", [])

            # Normalize the cover
            if "cover" in entry and isinstance(entry["cover"], dict):
                entry["cover_url"] = _build_image_url(
                    entry["cover"].get("url", ""),
                    size="t_cover_big"
                )
            else:
                entry["cover_url"] = ""

            entry.pop("cover", None)

            # Normalize the artworks
            artworks = game.get("artworks", [])

            entry["artwork_urls"] = [
                _build_image_url(
                    artwork.get("url", ""),
                    size="t_1080p"
                )
                for artwork in artworks
                if isinstance(artwork, dict) and artwork.get("url")
            ]
            entry.pop("artworks", None)
            useful_data.append(entry)

        return {
            "results": useful_data,
            "count": count,
        }

    def get_game(
        self,
        game_id: int,
    ) -> dict[str, typing.Any]:
        """Return a game's normalized details.

        Genres, platforms and involved companies are expanded with their
        names; ``involved_companies`` becomes a list of
        ``{"name", "developer", "publisher"}``.

        Returns:
            The game details, or ``{}`` if the id does not exist.
        """
        body = self._build_query(
            fields=list(METADATA["game"]) + [
                "cover.url",
                "artworks.url",
                "genres.name",
                "genres.slug",
                "platforms.name",
                "platforms.slug",
                "involved_companies.company.name",
                "involved_companies.developer",
                "involved_companies.publisher",
            ],
            where=f"id = {game_id}",
            limit=1,
        )

        results = self._post("/games", body)
        if not results:
            return {}

        game = results[0]
        useful_data = {
            k: v for k, v in game.items()
            if k in METADATA["game"] or k == "involved_companies"
        }

        # Cover
        if "cover" in useful_data and useful_data["cover"]:
            useful_data["cover_url"] = _build_image_url(
                useful_data["cover"].get("url", ""), size="t_cover_big"
            )
        else:
            useful_data["cover_url"] = ""
        useful_data.pop("cover", None)

        # Artworks (extra images, the equivalent of multiple background_image)
        if "artworks" in useful_data and useful_data["artworks"]:
            useful_data["artwork_urls"] = [
                _build_image_url(a.get("url", ""), size="t_1080p")
                for a in useful_data["artworks"]
            ]
        else:
            useful_data["artwork_urls"] = []
        useful_data.pop("artworks", None)

        # Involved companies
        useful_data["involved_companies"] = [
            {
                "name": company["company"]["name"],
                "developer": company.get("developer", False),
                "publisher": company.get("publisher", False),
            }
            for company in game.get("involved_companies", [])
            if company.get("company")
        ]

        return useful_data

    def list_game_screenshots(
        self,
        game_id: int,
    ) -> list[dict[str, typing.Any]]:
        """Return up to 20 screenshots of the game as ``{"id", "image"}``."""
        body = self._build_query(
            fields=["url", "game"],
            where=f"game = {game_id}",
            limit=20,
        )
        results = self._post("/screenshots", body)

        return [
            {
                "id": s.get("id"),
                "image": _build_image_url(
                    s.get("url", ""), size="t_screenshot_med"
                ),
            }
            for s in results
        ]

    def list_filters(
        self,
        filter_type: str | None = None,
    ) -> list[dict[str, typing.Any]]:
        """Return the list of genres or platforms (id, name, slug).

        Raises:
            ValueError: If ``filter_type`` is not "genres" or "platforms".
        """
        if filter_type is None or filter_type not in ("genres", "platforms"):
            raise ValueError("filter_type must be a valid string.")

        body = self._build_query(
            fields=["id", "name", "slug"],
            limit=500,
        )
        results = self._post(f"/{filter_type}", body)

        return [
            {k: v for k, v in e.items() if k in METADATA["base_filters"]}
            for e in results
        ]
