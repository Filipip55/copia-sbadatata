"""URL routes for the accounts app: sign-up, JWT login, logout and profile."""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    ChangeUsernameView,
    LoginView,
    LogoutView,
    RegisterView,
    UserDetailView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="token-obtain-pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("auth/change-username/", ChangeUsernameView.as_view(), name="change-username"),
    path("auth/me/", UserDetailView.as_view(), name="user-detail"),
]
