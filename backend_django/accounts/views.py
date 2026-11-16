from datetime import timedelta
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    ChangeUsernameSerializer,
    DeleteAccountSerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterSerializer,
    UserDetailSerializer,
)


class RegisterView(generics.CreateAPIView):
    """Sign up a new user.

    POST, open to anonymous users.
    Responses: 201 with the created user, 400 with per-field errors.
    """

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LoginView(TokenObtainPairView):
    """Issue JWTs for a username or email plus password."""

    serializer_class = LoginSerializer


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete the authenticated user's profile.

    GET, PUT, PATCH, DELETE; authentication required.
    DELETE requires user's current password in request body for security.
    Responses:
        200 with profile on GET/PUT/PATCH;
        204 No Content on successful DELETE;
        400 on validation errors (e.g., incorrect password on DELETE);
        401 if unauthenticated.
    """

    serializer_class = UserDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self) -> User:
        """Return the authenticated user (no lookup by URL kwarg)."""
        user = self.request.user
        assert isinstance(user, User)
        return user

    def delete(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Delete the account after verifying the password in the request body."""
        serializer = DeleteAccountSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = self.get_object()
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    """Update password for authenticated user with old password and confirmation check."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Set the new password once the old one and the confirmation are validated."""
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        assert isinstance(user, User)
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


class ChangeUsernameView(APIView):
    """Change the authenticated user's username, at most once every 14 days."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Change the username, enforcing the 14-day cooldown.

        The user row is locked (``select_for_update``) so that concurrent
        requests cannot bypass the cooldown. Submitting the current username
        is a no-op and does not reset the cooldown.
        """
        serializer = ChangeUsernameSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        requested_username = serializer.validated_data["username"]
        now = timezone.now()

        try:
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=request.user.pk)
                if user.username == requested_username:
                    return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)
                if (
                    user.last_username_change is not None
                    and user.last_username_change + timedelta(days=14) > now
                ):
                    available_at = user.last_username_change + timedelta(days=14)
                    raise ValidationError(
                        {
                            "username": "Username can be changed again after "
                            f"{available_at.isoformat()}."
                        }
                    )
                user.username = requested_username
                user.last_username_change = now
                user.save(update_fields=["username", "last_username_change"])
        except IntegrityError as exc:
            raise ValidationError(
                {"username": "A user with this username already exists."}
            ) from exc

        return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """Blacklist the submitted refresh token to terminate session securely."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Blacklist the refresh token; return 400 if it is invalid or already blacklisted."""
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            token.blacklist()
            return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
        except TokenError as exc:
            raise ValidationError({"refresh": str(exc)}) from exc
