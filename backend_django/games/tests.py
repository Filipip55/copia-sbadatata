from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from games.models import Game


class GameDetailTests(APITestCase):
    """GET /api/games/<id>/ for games already cached in the database."""

    def setUp(self) -> None:
        self.user = User.objects.create_user("mario", "Esplora-Giochi-42")
        self.game = Game.objects.create(
            id=999,
            name="Chrono Trigger",
            slug="chrono-trigger",
            rating=98.0,
            genres=[{"id": 3, "name": "RPG"}],
            platforms=[{"id": 4, "name": "SNES"}],
        )
        self.detail_url = reverse("game-detail", kwargs={"game_id": self.game.id})

    def test_get_existing_game_detail(self) -> None:
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], 999)
        self.assertEqual(response.data["name"], "Chrono Trigger")
