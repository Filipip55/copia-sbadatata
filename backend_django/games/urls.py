from django.urls import path

from .views import (
    GameDetail,
    GameSearch,
    GenresRequest,
    PlatformsRequest,
)

urlpatterns = [
    path("games/", GameSearch.as_view(), name="game-search"),
    path("genres/", GenresRequest.as_view(), name="genres"),
    path("platforms/", PlatformsRequest.as_view(), name="platforms"),
    path("games/<int:game_id>/", GameDetail.as_view(), name="game-detail"),
]
