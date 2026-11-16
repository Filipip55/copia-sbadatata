"""Tests for personal lists: favorites and wishlist."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from games.models import Game

from .models import UserLibrary

User = get_user_model()
PASSWORD = "una-password-lunga-123"


class UserLibraryTests(APITestCase):
    """CRUD on the favorites and wishlist lists through /api/library/."""

    list_url = reverse("library-get-add")

    def setUp(self) -> None:
        self.user = User.objects.create_user("mario", PASSWORD)
        self.other = User.objects.create_user("luigi", PASSWORD)
        self.games = [
            Game.objects.create(id=game_id, slug=f"game-{game_id}", name=f"Game {game_id}")
            for game_id in (1, 2, 3)
        ]
        self.client.force_authenticate(self.user)

    def detail_url(self, game_id: int, list_type: str = "favorites") -> str:
        return reverse("library-delete", args=[game_id]) + f"?list_type={list_type}"

    def add(self, game_id: int, list_type: str = "favorites"):
        return self.client.post(
            self.list_url, {"game_id": game_id, "list_type": list_type}, format="json"
        )

    # --- authentication and validation ---

    def test_anonymous_user_is_rejected(self) -> None:
        self.client.force_authenticate(None)
        response = self.client.get(self.list_url, {"list_type": "favorites"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_type_is_required(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_library_list_type_no_longer_exists(self) -> None:
        response = self.add(1, list_type="library")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- POST ---

    def test_add_with_json_body(self) -> None:
        # Regression: with data.get(key=...) a JSON body (a dict) raised a 500 error.
        response = self.add(1)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["game"]["id"], 1)
        self.assertTrue(
            UserLibrary.objects.filter(user=self.user, game_id=1, list_type="favorites").exists()
        )

    def test_add_twice_is_idempotent(self) -> None:
        self.add(1)
        response = self.add(1)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(UserLibrary.objects.filter(user=self.user).count(), 1)

    def test_add_game_not_in_database(self) -> None:
        response = self.add(999)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_add_invalid_game_id(self) -> None:
        for value in ("abc", -1, 0, True, None):
            response = self.add(value)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, value)

    # --- GET ---

    def test_get_returns_newest_first_and_only_requested_list(self) -> None:
        self.add(1)
        self.add(2)
        self.add(3, list_type="wishlist")
        response = self.client.get(self.list_url, {"list_type": "favorites"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([entry["game"]["id"] for entry in response.data], [2, 1])

    def test_get_does_not_show_other_users_entries(self) -> None:
        UserLibrary.objects.create(user=self.other, game_id=1, list_type="favorites")
        response = self.client.get(self.list_url, {"list_type": "favorites"})
        self.assertEqual(response.data, [])

    # --- DELETE ---

    def test_delete(self) -> None:
        self.add(1)
        response = self.client.delete(self.detail_url(1))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserLibrary.objects.filter(user=self.user).exists())

    def test_delete_only_touches_requested_list(self) -> None:
        self.add(1)
        self.add(1, list_type="wishlist")
        self.client.delete(self.detail_url(1, "wishlist"))
        self.assertTrue(
            UserLibrary.objects.filter(user=self.user, game_id=1, list_type="favorites").exists()
        )

    def test_delete_missing_entry(self) -> None:
        response = self.client.delete(self.detail_url(1))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- PUT (replacement at login) ---

    def test_replace_list_keeps_given_order(self) -> None:
        self.add(1)
        response = self.client.put(
            self.list_url, {"list_type": "favorites", "game_ids": [3, 2, 3]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([entry["game"]["id"] for entry in response.data], [3, 2])
        self.assertFalse(
            UserLibrary.objects.filter(user=self.user, game_id=1, list_type="favorites").exists()
        )

    def test_replace_does_not_touch_other_list_or_users(self) -> None:
        self.add(1, list_type="wishlist")
        UserLibrary.objects.create(user=self.other, game_id=1, list_type="favorites")
        self.client.put(
            self.list_url, {"list_type": "favorites", "game_ids": [2]}, format="json"
        )
        self.assertTrue(
            UserLibrary.objects.filter(user=self.user, game_id=1, list_type="wishlist").exists()
        )
        self.assertTrue(UserLibrary.objects.filter(user=self.other).exists())

    def test_replace_with_unknown_game_changes_nothing(self) -> None:
        self.add(1)
        response = self.client.put(
            self.list_url, {"list_type": "favorites", "game_ids": [2, 999]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["missing_ids"], [999])
        self.assertEqual(
            list(UserLibrary.objects.filter(user=self.user).values_list("game_id", flat=True)),
            [1],
        )

    def test_replace_requires_a_list(self) -> None:
        response = self.client.put(
            self.list_url, {"list_type": "favorites", "game_ids": "1,2"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
