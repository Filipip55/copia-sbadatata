from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


class CustomUserAdmin(UserAdmin):
    """Django admin for the custom ``User`` model, showing theme preference in the list."""

    list_display = [
        "username",
        "email",
        "theme_preference",
        "is_staff",
        "is_active",
        "date_joined",
    ]


admin.site.register(User, CustomUserAdmin)
