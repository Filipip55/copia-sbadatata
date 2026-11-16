from typing import Any

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_404_NOT_FOUND,
)
from rest_framework.views import APIView

from games.models import Game

from .models import UserLibrary
from .serializers import UserLibrarySerializer


def validate_list_type(
    data: Any
) -> str:
    """Read and validate "list_type" from the query params or the JSON body.

    ``data`` can be a QueryDict (query params) or a dict (body). Note that
    dict.get() does not accept keyword arguments, so the key must be
    passed positionally.

    Raises:
        ValidationError: If ``list_type`` is missing or not a valid choice.
    """
    list_type = data.get("list_type")

    if not list_type:
        raise ValidationError(
            {"list_type": "This parameter is required."}
        )

    if list_type not in UserLibrary.ListType.values:
        raise ValidationError(
            {"list_type": "Invalid value. Allowed values: favorites, wishlist."}
        )

    return list_type


def parse_game_id(
    value: Any
) -> int:
    """Convert a game id to a positive integer, or raise a 400 error."""
    # bool is a subclass of int: True must not become id 1.
    if isinstance(value, bool):
        raise ValidationError(
            {"game_id": "A valid positive integer is required."}
        )
    try:
        game_id = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            {"game_id": "A valid positive integer is required."}
        ) from exc
    if game_id <= 0:
        raise ValidationError(
            {"game_id": "A valid positive integer is required."}
        )
    return game_id


def user_list(
    user: Any,
    list_type: str,
) -> Any:
    """Return the entries of a list, from most to least recent."""
    return (
        UserLibrary.objects
        .filter(user=user, list_type=list_type)
        .select_related("game")
        .order_by("-added_at", "-id")
    )


class UserLibraryList(APIView):
    """Read, add to, and replace the user's personal lists.

    GET  /api/library/?list_type=favorites    → list entries
    POST /api/library/  {game_id, list_type}  → add a game
    PUT  /api/library/  {list_type, game_ids} → replace the whole list

    The game must already be in the Game table: the frontend gets it saved
    by calling GET /api/games/<id>/ first.
    """

    permission_classes = [
        IsAuthenticated
    ]

    def get(
        self,
        request: Request,
    ) -> Response:
        """Return the entries of the requested list, most recent first."""
        list_type = validate_list_type(
            data=request.query_params
        )

        serializer = UserLibrarySerializer(
            user_list(request.user, list_type), many=True
        )
        return Response(serializer.data)

    def post(
        self,
        request: Request,
    ) -> Response:
        """Add a game to the list (201 if new, 200 if already there).

        Respond 404 if the game is not in the Game table yet.
        """
        game_id = parse_game_id(
            request.data.get("game_id")
        )
        list_type = validate_list_type(
            data=request.data
        )

        game = Game.objects.filter(id=game_id).first()
        if not game:
            raise NotFound(
                "Game not found."
            )

        # Idempotent: adding the same game twice is not an error
        # (e.g. a double click); respond 200 instead of 201.
        entry, created = UserLibrary.objects.get_or_create(
            user=request.user,
            game=game,
            list_type=list_type
        )

        return Response(
            data=UserLibrarySerializer(entry).data,
            status=HTTP_201_CREATED if created else HTTP_200_OK
        )

    def put(
        self,
        request: Request,
    ) -> Response:
        """Replace the list with the given games.

        Used at login, when the lists saved in the browser take the place
        of those on the server. ``game_ids`` is ordered from most to least
        recent. Respond 404 with ``missing_ids`` if some games are not in
        the database.
        """
        list_type = validate_list_type(
            data=request.data
        )

        raw_ids = request.data.get("game_ids")
        if not isinstance(raw_ids, list):
            raise ValidationError(
                {"game_ids": "A list of game ids is required."}
            )

        # Remove duplicates while keeping the order.
        game_ids = list(dict.fromkeys(parse_game_id(value) for value in raw_ids))

        found = set(
            Game.objects.filter(id__in=game_ids).values_list("id", flat=True)
        )
        missing = [game_id for game_id in game_ids if game_id not in found]
        if missing:
            # Plain Response (not NotFound) so the ids are returned as numbers.
            return Response(
                data={
                    "detail": "Some games are not in the database.",
                    "missing_ids": missing,
                },
                status=HTTP_404_NOT_FOUND
            )

        with transaction.atomic():
            UserLibrary.objects.filter(
                user=request.user,
                list_type=list_type
            ).delete()
            # Create from least to most recent, so that ordering by
            # added_at (and id) matches the order received.
            UserLibrary.objects.bulk_create(
                UserLibrary(user=request.user, game_id=game_id, list_type=list_type)
                for game_id in reversed(game_ids)
            )

        serializer = UserLibrarySerializer(
            user_list(request.user, list_type), many=True
        )
        return Response(serializer.data)


class UserLibraryDetail(APIView):
    """Remove a game from a personal list.

    DELETE /api/library/<game_id>/?list_type=favorites
    """

    permission_classes = [
        IsAuthenticated
    ]

    def delete(
        self,
        request: Request,
        game_id: int,
    ) -> Response:
        """Remove the game from the list: 204 if removed, 404 if it was not there."""
        list_type = validate_list_type(
            data=request.query_params
        )
        deleted, _ = UserLibrary.objects.filter(
            user=request.user,
            game_id=game_id,
            list_type=list_type
        ).delete()

        if deleted:
            return Response(
                status=HTTP_204_NO_CONTENT
            )

        raise NotFound(
            "This game is not in the specified list."
        )
