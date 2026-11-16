"""Tests for the accounts app: user manager, sign-up, JWT login and profile."""

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from games.models import Game
from library.models import UserLibrary

from .models import User

# Long enough and unrelated to the usernames, so it passes Django's validators.
STRONG_PASSWORD = "Esplora-Giochi-42"


class UserManagerTests(TestCase):
    """UserManager: creation rules, password handling, username normalization."""

    def test_create_user_without_password_gets_unusable_password(self) -> None:
        user = User.objects.create_user("mario")
        self.assertFalse(user.has_usable_password())

    def test_create_user_with_empty_password_raises(self) -> None:
        with self.assertRaises(ValueError):
            User.objects.create_user("mario", "")

    def test_create_user_with_empty_username_raises(self) -> None:
        with self.assertRaises(ValueError):
            User.objects.create_user("", STRONG_PASSWORD)

    def test_password_is_hashed(self) -> None:
        user = User.objects.create_user("mario", STRONG_PASSWORD)
        self.assertNotEqual(user.password, STRONG_PASSWORD)
        self.assertTrue(user.check_password(STRONG_PASSWORD))

    def test_username_is_nfkc_normalized(self) -> None:
        # Fullwidth characters become their plain ASCII equivalents.
        fullwidth = "\uff4d\uff41\uff52\uff49\uff4f"
        user = User.objects.create_user(fullwidth, STRONG_PASSWORD)
        self.assertEqual(user.username, "mario")

    def test_regular_user_defaults(self) -> None:
        user = User.objects.create_user("mario", STRONG_PASSWORD)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_active)
        self.assertEqual(user.theme_preference, User.Theme.LIGHT)

    def test_create_superuser_sets_flags(self) -> None:
        admin = User.objects.create_superuser("admin", STRONG_PASSWORD)
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_create_superuser_rejects_is_staff_false(self) -> None:
        with self.assertRaises(ValueError):
            User.objects.create_superuser("admin", STRONG_PASSWORD, is_staff=False)


class RegisterEndpointTests(APITestCase):
    """POST /api/auth/register/: validation rules and response shape."""

    url = reverse("accounts:register")

    def test_register_creates_user_and_hides_password(self) -> None:
        response = self.client.post(
            self.url,
            {
                "username": "mario",
                "email": "mario@example.com",
                "password": STRONG_PASSWORD,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("password", response.data)
        self.assertEqual(response.data["theme_preference"], User.Theme.LIGHT)
        # The user exists and the password was hashed through the manager.
        user = User.objects.get(username="mario")
        self.assertTrue(user.check_password(STRONG_PASSWORD))

    def test_register_requires_email(self) -> None:
        response = self.client.post(
            self.url, {"username": "mario", "password": STRONG_PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_duplicate_username_is_rejected(self) -> None:
        User.objects.create_user("mario", STRONG_PASSWORD)
        response = self.client.post(
            self.url,
            {
                "username": "mario",
                "email": "mario@example.com",
                "password": STRONG_PASSWORD,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_password_similar_to_username_is_rejected(self) -> None:
        # Exercises validate(): UserAttributeSimilarityValidator needs the username.
        response = self.client.post(
            self.url,
            {"username": "mario", "email": "mario@example.com", "password": "mario123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertFalse(User.objects.filter(username="mario").exists())

    def test_invalid_theme_is_rejected(self) -> None:
        response = self.client.post(
            self.url,
            {
                "username": "mario",
                "email": "mario@example.com",
                "password": STRONG_PASSWORD,
                "theme_preference": "blue",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("theme_preference", response.data)

    def test_username_with_spaces_is_rejected(self) -> None:
            # Model validators run in the serializer, not in UserManager.save().
            response = self.client.post(
                self.url,
                {
                    "username": "m a r i o",
                    "email": "mario@example.com",
                    "password": STRONG_PASSWORD,
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("username", response.data)

    def test_register_with_email(self) -> None:
        response = self.client.post(
            self.url,
            {"username": "luigi", "password": STRONG_PASSWORD, "email": "luigi@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "luigi@example.com")
        user = User.objects.get(username="luigi")
        self.assertEqual(user.email, "luigi@example.com")

    def test_duplicate_email_is_rejected(self) -> None:
        User.objects.create_user("mario", STRONG_PASSWORD, email="mario@example.com")
        response = self.client.post(
            self.url,
            {"username": "luigi", "password": STRONG_PASSWORD, "email": "mario@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_duplicate_email_is_rejected_case_insensitively(self) -> None:
        User.objects.create_user("mario", STRONG_PASSWORD, email="mario@example.com")
        response = self.client.post(
            self.url,
            {
                "username": "luigi",
                "password": STRONG_PASSWORD,
                "email": "MARIO@EXAMPLE.COM",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

class AuthFlowTests(APITestCase):
    """JWT login, token refresh and the /me profile endpoint."""

    login_url = reverse("accounts:token-obtain-pair")
    refresh_url = reverse("accounts:token-refresh")
    me_url = reverse("accounts:user-detail")
    logout_url = reverse("accounts:logout")
    change_password_url = reverse("accounts:change-password")
    change_username_url = reverse("accounts:change-username")

    def setUp(self) -> None:
        self.user = User.objects.create_user("mario", STRONG_PASSWORD)

    def _login(self) -> dict[str, str]:
        """Log in through the real endpoint and return the token pair."""
        response = self.client.post(
            self.login_url,
            {"username": "mario", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _authenticate(self) -> None:
        """Send the access token in the Authorization header of later requests."""
        tokens = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    def test_login_returns_access_and_refresh_tokens(self) -> None:
        tokens = self._login()
        self.assertIn("access", tokens)
        self.assertIn("refresh", tokens)

    def test_login_accepts_email(self) -> None:
        self.user.email = "mario@example.com"
        self.user.save(update_fields=["email"])
        response = self.client.post(
            self.login_url,
            {"username": "MARIO@EXAMPLE.COM", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_login_unknown_identifier_returns_field_error(self) -> None:
        response = self.client.post(
            self.login_url,
            {"username": "unknown@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_login_with_wrong_password_is_rejected(self) -> None:
        response = self.client.post(
            self.login_url, {"username": "mario", "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_refresh_returns_new_access_token(self) -> None:
        tokens = self._login()
        response = self.client.post(
            self.refresh_url, {"refresh": tokens["refresh"]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_refresh_rotates_and_blacklists_old_refresh_token(self) -> None:
        tokens = self._login()
        old_refresh = tokens["refresh"]
        response = self.client.post(
            self.refresh_url, {"refresh": old_refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        new_refresh = response.data["refresh"]
        self.assertNotEqual(old_refresh, new_refresh)

        # Old refresh token is blacklisted and cannot be reused
        reuse_response = self.client.post(
            self.refresh_url, {"refresh": old_refresh}, format="json"
        )
        self.assertEqual(reuse_response.status_code, status.HTTP_401_UNAUTHORIZED)

        # New refresh token works
        second_refresh_response = self.client.post(
            self.refresh_url, {"refresh": new_refresh}, format="json"
        )
        self.assertEqual(second_refresh_response.status_code, status.HTTP_200_OK)

    def test_me_without_token_returns_401(self) -> None:
        # 401 (not 403) only if JWTAuthentication is configured in REST_FRAMEWORK.
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_own_profile(self) -> None:
        self._authenticate()
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "mario")
        self.assertNotIn("password", response.data)

    def test_patch_updates_theme(self) -> None:
        self._authenticate()
        response = self.client.patch(
            self.me_url, {"theme_preference": User.Theme.DARK}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.theme_preference, User.Theme.DARK)

    def test_patch_updates_avatar(self) -> None:
        self._authenticate()
        response = self.client.patch(self.me_url, {"avatar": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["avatar"], 3)
        self.user.refresh_from_db()
        self.assertEqual(self.user.avatar, 3)

    def test_patch_clears_avatar_with_null(self) -> None:
        self.user.avatar = 2
        self.user.save(update_fields=["avatar"])
        self._authenticate()
        response = self.client.patch(self.me_url, {"avatar": None}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["avatar"])
        self.user.refresh_from_db()
        self.assertIsNone(self.user.avatar)

    def test_patch_rejects_invalid_avatar(self) -> None:
        self._authenticate()
        response = self.client.patch(self.me_url, {"avatar": 10}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.data)

        neg_response = self.client.patch(self.me_url, {"avatar": -1}, format="json")
        self.assertEqual(neg_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", neg_response.data)

    def test_patch_ignores_read_only_username(self) -> None:
        # DRF silently drops read-only fields: 200, but nothing changes.
        self._authenticate()
        response = self.client.patch(self.me_url, {"username": "luigi"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "mario")

    def test_change_username_updates_timestamp_and_rejects_duplicate(self) -> None:
        other_user = User.objects.create_user("luigi", STRONG_PASSWORD)
        self._authenticate()

        response = self.client.post(
            self.change_username_url, {"username": "peach"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "peach")
        self.assertIsNotNone(self.user.last_username_change)

        duplicate = self.client.post(
            self.change_username_url, {"username": other_user.username}, format="json"
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", duplicate.data)

    def test_change_username_is_limited_to_once_every_fourteen_days(self) -> None:
        self._authenticate()
        first = self.client.post(
            self.change_username_url, {"username": "peach"}, format="json"
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            self.change_username_url, {"username": "daisy"}, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", second.data)

    def test_patch_ignores_read_only_email(self) -> None:
        self._authenticate()
        response = self.client.patch(
            self.me_url, {"email": "mario.new@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email)

    def test_me_returns_profile_counters_and_email(self) -> None:
        self._authenticate()
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("email", response.data)
        self.assertIn("date_joined", response.data)
        self.assertEqual(response.data["favorites_count"], 0)
        self.assertEqual(response.data["wishlist_count"], 0)

    def test_delete_account_with_wrong_password_rejected(self) -> None:
        self._authenticate()
        response = self.client.delete(self.me_url, {"password": "wrong-password"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(username="mario").exists())

    def test_delete_account_with_correct_password_deletes_user_and_cascades(self) -> None:
        self._authenticate()
        game = Game.objects.create(
            id=101,
            name="Zelda",
            slug="zelda",
            genres=[{"id": 1, "name": "Adventure"}],
            platforms=[{"id": 1, "name": "Switch"}],
        )
        UserLibrary.objects.create(
            user=self.user,
            game=game,
            list_type=UserLibrary.ListType.FAVORITES,
        )

        response = self.client.delete(self.me_url, {"password": STRONG_PASSWORD}, format="json")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(username="mario").exists())
        self.assertFalse(UserLibrary.objects.filter(user_id=self.user.id).exists())

    def test_change_password_success(self) -> None:
        self._authenticate()
        new_pass = "Nuova-Super-Password-99"
        response = self.client.post(
            self.change_password_url,
            {
                "old_password": STRONG_PASSWORD,
                "new_password": new_pass,
                "confirm_password": new_pass,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Old password no longer works
        old_login = self.client.post(
            self.login_url,
            {"username": "mario", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(old_login.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", old_login.data)

        # New password logs in successfully
        new_login = self.client.post(
            self.login_url,
            {"username": "mario", "password": new_pass},
            format="json",
        )
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

    def test_change_password_with_wrong_old_password_rejected(self) -> None:
        self._authenticate()
        new_pass = "Nuova-Super-Password-99"
        response = self.client.post(
            self.change_password_url,
            {
                "old_password": "wrong-password",
                "new_password": new_pass,
                "confirm_password": new_pass,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("old_password", response.data)

    def test_change_password_with_mismatched_confirm_rejected(self) -> None:
        self._authenticate()
        response = self.client.post(
            self.change_password_url,
            {
                "old_password": STRONG_PASSWORD,
                "new_password": "Nuova-Password-123",
                "confirm_password": "Different-Password-456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)

    def test_change_password_with_weak_password_rejected(self) -> None:
        self._authenticate()
        response = self.client.post(
            self.change_password_url,
            {
                "old_password": STRONG_PASSWORD,
                "new_password": "short",
                "confirm_password": "short",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)

    def test_logout_blacklists_refresh_token(self) -> None:
        tokens = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Trying to refresh the blacklisted token must now return 401
        refresh_resp = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(refresh_resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AccountEdgeCasesTests(APITestCase):
    """Deep edge-case and boundary testing for accounts, security, and profile."""

    register_url = reverse("accounts:register")
    login_url = reverse("accounts:token-obtain-pair")
    refresh_url = reverse("accounts:token-refresh")
    logout_url = reverse("accounts:logout")
    me_url = reverse("accounts:user-detail")
    change_password_url = reverse("accounts:change-password")

    def _auth_client_as(self, user: User) -> dict[str, str]:
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return {"access": access, "refresh": str(refresh)}

    def test_registration_rejects_blank_or_none_email(self) -> None:
        """Email is required for every public registration."""
        r1 = self.client.post(
            self.register_url,
            {"username": "user1", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", r1.data)

        r2 = self.client.post(
            self.register_url,
            {"username": "user2", "password": STRONG_PASSWORD, "email": ""},
            format="json",
        )
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", r2.data)

        r3 = self.client.post(
            self.register_url,
            {"username": "user3", "password": STRONG_PASSWORD, "email": None},
            format="json",
        )
        self.assertEqual(r3.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", r3.data)

    def test_case_insensitive_email_uniqueness_on_registration(self) -> None:
        User.objects.create_user("luigi_orig", STRONG_PASSWORD, email="luigi@nintendo.com")
        response = self.client.post(
            self.register_url,
            {"username": "luigi2", "password": STRONG_PASSWORD, "email": "LUIGI@NINTENDO.COM"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_invalid_email_format_rejected(self) -> None:
        response = self.client.post(
            self.register_url,
            {"username": "bademail", "password": STRONG_PASSWORD, "email": "not-an-email-at-all"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_patch_email_is_ignored(self) -> None:
        user1 = User.objects.create_user("user_email_1", STRONG_PASSWORD, email="user1@example.com")
        user2 = User.objects.create_user("user_email_2", STRONG_PASSWORD, email="user2@example.com")

        self._auth_client_as(user1)
        res_self = self.client.patch(self.me_url, {"email": "User1@Example.com"}, format="json")
        self.assertEqual(res_self.status_code, status.HTTP_200_OK)
        user1.refresh_from_db()
        self.assertEqual(user1.email, "user1@example.com")

        self._auth_client_as(user2)
        res_dup = self.client.patch(self.me_url, {"email": "user1@example.com"}, format="json")
        self.assertEqual(res_dup.status_code, status.HTTP_200_OK)
        user2.refresh_from_db()
        self.assertEqual(user2.email, "user2@example.com")

    def test_patch_cannot_clear_email(self) -> None:
        user = User.objects.create_user("user_clear", STRONG_PASSWORD, email="clear@example.com")
        self._auth_client_as(user)
        response = self.client.patch(self.me_url, {"email": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertEqual(user.email, "clear@example.com")

    def test_logout_missing_refresh_token_rejected(self) -> None:
        user = User.objects.create_user("logout_user", STRONG_PASSWORD)
        self._auth_client_as(user)
        response = self.client.post(self.logout_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("refresh", response.data)

    def test_logout_malformed_token_rejected(self) -> None:
        user = User.objects.create_user("logout_user2", STRONG_PASSWORD)
        self._auth_client_as(user)
        response = self.client.post(self.logout_url, {"refresh": "not.a.valid.jwt"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("refresh", response.data)

    def test_logout_with_access_token_instead_of_refresh_rejected(self) -> None:
        user = User.objects.create_user("logout_user3", STRONG_PASSWORD)
        tokens = self._auth_client_as(user)
        # Passing access token instead of refresh
        response = self.client.post(self.logout_url, {"refresh": tokens["access"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_already_blacklisted_token_rejected(self) -> None:
        user = User.objects.create_user("logout_user4", STRONG_PASSWORD)
        tokens = self._auth_client_as(user)
        first_logout = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(first_logout.status_code, status.HTTP_200_OK)

        second_logout = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(second_logout.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_missing_fields(self) -> None:
        user = User.objects.create_user("pw_user", STRONG_PASSWORD)
        self._auth_client_as(user)
        # Missing confirm_password
        res1 = self.client.post(
            self.change_password_url,
            {"old_password": STRONG_PASSWORD, "new_password": "Another-Safe-Pass-123"},
            format="json",
        )
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # Missing old_password
        res2 = self.client.post(
            self.change_password_url,
            {"new_password": "Another-Safe-Pass-123", "confirm_password": "Another-Safe-Pass-123"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_multiple_successive_rotations(self) -> None:
        user = User.objects.create_user("rotator", STRONG_PASSWORD)
        self._auth_client_as(user)

        pass2 = "Second-Secure-Pass-1"
        res2 = self.client.post(
            self.change_password_url,
            {"old_password": STRONG_PASSWORD, "new_password": pass2, "confirm_password": pass2},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        pass3 = "Third-Secure-Pass-2"
        res3 = self.client.post(
            self.change_password_url,
            {"old_password": pass2, "new_password": pass3, "confirm_password": pass3},
            format="json",
        )
        self.assertEqual(res3.status_code, status.HTTP_200_OK)

        # Verify pass1 and pass2 cannot log in, pass3 logs in
        login1 = self.client.post(
            self.login_url,
            {"username": "rotator", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(login1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", login1.data)

        login2 = self.client.post(
            self.login_url,
            {"username": "rotator", "password": pass2},
            format="json",
        )
        self.assertEqual(login2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", login2.data)

        login3 = self.client.post(
            self.login_url,
            {"username": "rotator", "password": pass3},
            format="json",
        )
        self.assertEqual(login3.status_code, status.HTTP_200_OK)

    def test_delete_account_missing_password_rejected(self) -> None:
        user = User.objects.create_user("del_user1", STRONG_PASSWORD)
        self._auth_client_as(user)
        response = self.client.delete(self.me_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(username="del_user1").exists())

    def test_delete_account_token_invalidation_and_isolation(self) -> None:
        user_to_delete = User.objects.create_user("victim", STRONG_PASSWORD)
        user_to_keep = User.objects.create_user("survivor", STRONG_PASSWORD)

        game = Game.objects.create(id=555, name="Game 555", slug="game-555")
        UserLibrary.objects.create(
            user=user_to_delete,
            game=game,
            list_type=UserLibrary.ListType.FAVORITES,
        )
        UserLibrary.objects.create(
            user=user_to_keep,
            game=game,
            list_type=UserLibrary.ListType.FAVORITES,
        )

        # Delete user_to_delete
        self._auth_client_as(user_to_delete)
        resp_del = self.client.delete(self.me_url, {"password": STRONG_PASSWORD}, format="json")
        self.assertEqual(resp_del.status_code, status.HTTP_204_NO_CONTENT)

        # Calling /me with deleted user's token returns 401
        resp_retry = self.client.get(self.me_url)
        self.assertEqual(resp_retry.status_code, status.HTTP_401_UNAUTHORIZED)

        # Survivor's account and data are completely intact
        self.assertTrue(User.objects.filter(username="survivor").exists())
        self.assertTrue(UserLibrary.objects.filter(user=user_to_keep).exists())

    def test_unauthenticated_protected_endpoints(self) -> None:
        """Verify that endpoints requiring authentication reject unauthenticated requests."""
        r1 = self.client.post(
            self.change_password_url,
            {"old_password": "x", "new_password": "y", "confirm_password": "y"},
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_401_UNAUTHORIZED)

        r2 = self.client.post(self.logout_url, {"refresh": "dummy"}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_401_UNAUTHORIZED)

        r3 = self.client.get(self.me_url)
        self.assertEqual(r3.status_code, status.HTTP_401_UNAUTHORIZED)

        r4 = self.client.delete(self.me_url, {"password": "pass"}, format="json")
        self.assertEqual(r4.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_and_refresh_inactive_user_rejected(self) -> None:
        """Deactivated users (is_active=False) cannot log in or refresh tokens."""
        user = User.objects.create_user("inactive_user", STRONG_PASSWORD)
        tokens = self._auth_client_as(user)

        user.is_active = False
        user.save()

        # Login fails for inactive user
        login_resp = self.client.post(
            self.login_url,
            {"username": "inactive_user", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(login_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", login_resp.data)

        # Token refresh fails for inactive user
        refresh_resp = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(refresh_resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_change_case_sensitive_mismatch(self) -> None:
        user = User.objects.create_user("case_user", STRONG_PASSWORD)
        self._auth_client_as(user)
        response = self.client.post(
            self.change_password_url,
            {
                "old_password": STRONG_PASSWORD,
                "new_password": "Super-Secret-Pass-123",
                "confirm_password": "super-secret-pass-123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)
