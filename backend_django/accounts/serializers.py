from datetime import datetime, timedelta
from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    """Validate sign-up data and create a new user.

    Input:  {"username": "mario", "password": "...", "email": "mario@example.com",
             "theme_preference": "dark"}
    Output: {"id": 1, "username": "mario", "email": "mario@example.com", "theme_preference": "dark"}

    ``theme_preference`` is optional.
    """

    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True, allow_blank=False, allow_null=False)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "theme_preference")

    def validate_email(self, value: str | None) -> str | None:
        """Normalize the email (strip, lowercase) and reject duplicates, case-insensitively."""
        if not value:
            return None
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(
            self,
            attrs: dict[str, Any]
            ) -> dict[str, Any]:
        """Run Django's password validators against the submitted password."""
        candidate = User(username=attrs.get("username", ""))
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs

    def create(
            self,
            validated_data: dict[str, Any]
            ) -> User:
        """Create the user through ``UserManager.create_user``."""
        try:
            with transaction.atomic():
                return User.objects.create_user(**validated_data)
        except IntegrityError as exc:
            if "email" in str(exc).lower():
                raise serializers.ValidationError(
                    {"email": "A user with this email already exists."}
                ) from exc
            if "username" in str(exc).lower():
                raise serializers.ValidationError(
                    {"username": "A user with this username already exists."}
                ) from exc
            raise


class LoginSerializer(TokenObtainPairSerializer):
    """Issue JWTs using either the unique username or email address."""

    username = serializers.CharField(
        write_only=True,
        required=True,
        help_text="Username or email address.",
    )

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        """Resolve the identifier to a user, check credentials, and issue tokens.

        The identifier is matched first against the username (exact), then
        against the email (case-insensitive).

        Raises:
            ValidationError: If no user matches, the password is wrong,
                or the user is inactive.
        """
        identifier = attrs["username"]
        password = attrs["password"]
        user = User.objects.filter(username=identifier).first()
        if user is None:
            user = User.objects.filter(email__iexact=identifier).first()

        if user is None:
            raise serializers.ValidationError(
                {"username": "No user was found with this username or email."}
            )
        if not user.check_password(password):
            raise serializers.ValidationError({"password": "Incorrect password."})
        if not user.is_active:
            raise serializers.ValidationError({"username": "This user is inactive."})

        return super().validate(
            {"username": user.username, "password": password}
        )


class UserDetailSerializer(serializers.ModelSerializer):
    """Read and update the authenticated user's profile.

    Output includes id, username, email, theme preference, date joined,
    and summary counters for personal lists.
    """

    favorites_count = serializers.SerializerMethodField()
    wishlist_count = serializers.SerializerMethodField()
    username_change_available_at = serializers.SerializerMethodField()
    avatar = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=5,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "avatar",
            "theme_preference",
            "date_joined",
            "favorites_count",
            "wishlist_count",
            "username_change_available_at",
        )
        read_only_fields = (
            "id",
            "username",
            "email",
            "date_joined",
            "username_change_available_at",
            "favorites_count",
            "wishlist_count",
        )

    def get_favorites_count(self, obj: User) -> int:
        """Return how many games are in the user's favorites list."""
        from library.models import UserLibrary
        return UserLibrary.objects.filter(
            user=obj, list_type=UserLibrary.ListType.FAVORITES
        ).count()

    def get_wishlist_count(self, obj: User) -> int:
        """Return how many games are in the user's wishlist."""
        from library.models import UserLibrary
        return UserLibrary.objects.filter(
            user=obj, list_type=UserLibrary.ListType.WISHLIST
        ).count()

    def get_username_change_available_at(self, obj: User) -> datetime | None:
        """Return when the username can next be changed, or ``None`` if it never was."""
        if obj.last_username_change is None:
            return None
        return obj.last_username_change + timedelta(days=14)


class ChangeUsernameSerializer(serializers.Serializer):
    """Validate a username change for the authenticated user."""

    username = serializers.CharField(max_length=20, required=True)

    def validate_username(self, value: str) -> str:
        """Normalize the username, run the model field validators, and reject duplicates.

        The duplicate check is case-insensitive and excludes the current user.
        """
        value = User.normalize_username(value)
        field = User._meta.get_field("username")
        for validator in field.validators:
            validator(value)
        user = self.context["request"].user
        if User.objects.filter(username__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """Validate old password and update to new password with confirmation."""

    old_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True)
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate_old_password(self, value: str) -> str:
        """Check that ``old_password`` matches the user's current password."""
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is not correct.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """Check that the two new passwords match and pass Django's password validators."""
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        user = self.context["request"].user
        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc
        return attrs


class DeleteAccountSerializer(serializers.Serializer):
    """Confirm user password before account deletion."""

    password = serializers.CharField(write_only=True, required=True)

    def validate_password(self, value: str) -> str:
        """Check that the submitted password matches the user's current password."""
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Password is not correct.")
        return value


class LogoutSerializer(serializers.Serializer):
    """Validate refresh token to blacklist on logout."""

    refresh = serializers.CharField(required=True)
