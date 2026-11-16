from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models.functions import Lower


class UserManager(BaseUserManager):
    """Manager for custom User model."""

    def _create_user(
            self,
            username: str,
            password: str | None,
            email: str | None = None,
            **extra_fields: Any,
            ) -> "User":
        """Create and save a user with the given username and password.

        Shared helper for ``create_user`` and ``create_superuser``. The username
        is Unicode-normalized (NFKC) and the password is hashed before saving.

        Args:
            username: Unique login identifier. Must not be empty.
            password: Raw password. If ``None``, the user gets an unusable password.
            email: Optional email address.
            **extra_fields: Additional model fields.

        Returns:
            The newly created and saved user.

        Raises:
            ValueError: If ``username`` is empty or ``password`` is an empty string,

        """
        if not username:
            raise ValueError("Username must not be empty.")
        if password == "":
            raise ValueError("Password must not be empty; use None for an unusable password.")
        username = self.model.normalize_username(username)
        if email:
            email = self.normalize_email(email).strip().lower()
        else:
            email = None
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(
            self,
            username: str,
            password: str | None = None,
            email: str | None = None,
            **extra_fields: Any,
            ) -> "User":
        """Create and save a regular (non-admin) user.

        Args:
            username: Unique login identifier. Must not be empty.
            password: Raw password. If ``None``, the user gets an unusable password.
            email: Optional email address.
            **extra_fields: Additional model fields.

        Returns:
            The newly created and saved user.

        Raises:
            ValueError: If ``username`` is empty or ``password`` is an empty string,

        """
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(username, password, email=email, **extra_fields)

    def create_superuser(
            self,
            username: str,
            password: str | None = None,
            email: str | None = None,
            **extra_fields: Any,
            ) -> "User":
        """Create and save a superuser with staff and superuser flags set.

        Args:
            username: Unique login identifier. Must not be empty.
            password: Raw password. If ``None``, the user gets an unusable password.
            email: Optional email address.
            **extra_fields: Additional model fields.

        Returns:
            The newly created and saved user.

        Raises:
            ValueError: If ``username`` is empty or ``password`` is an empty string,
                or if ``is_staff`` or ``is_superuser`` is set to a value other than ``True``.
        """
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(username, password, email=email, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Minimal custom user model, authenticated by username.

    Fields defined here:
        ``username``, ``theme_preference``, ``is_staff``, ``is_active``,
        ``date_joined``, ``last_username_change``.
    Fields inherited:
        from ``AbstractBaseUser``: ``password``, ``last_login``;
        from ``PermissionsMixin``: ``is_superuser``, ``groups``, ``user_permissions``.
    """

    class Theme(models.TextChoices):
        """UI theme options available to the user."""

        LIGHT = "light", "Light"
        DARK = "dark", "Dark"

    username = models.CharField(
        max_length=20,
        unique=True,
        validators=[
            RegexValidator(
                regex=r"^[A-Za-z0-9]+$",
                message="Username can contain only letters and numbers.",
            ),
        ],
        help_text="Unique user identifier.",
    )

    email = models.EmailField(
        max_length=254,
        blank=True,
        null=True,
        help_text="User email address.",
    )

    theme_preference = models.CharField(
        max_length=10,
        choices=Theme.choices,
        default=Theme.LIGHT,
        help_text="UI theme chosen by the user.",
    )

    avatar = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        help_text="Selected avatar sprite index (0-5), or null for default icon.",
    )

    is_staff = models.BooleanField(
        default=False,
        help_text="Designates whether the user can log into the admin site.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Designates whether this account is active.",
    )

    date_joined = models.DateTimeField(auto_now_add=True)

    last_username_change = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp of the most recent username change.",
    )

    objects = UserManager()

    # Field used to identify the user at login (must be unique).
    USERNAME_FIELD = "username"
    # Extra fields prompted by `createsuperuser`, besides username and password.
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=models.Q(email__isnull=False),
                name="unique_user_email_ci",
            ),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Normalize the email before saving.

        An empty string is stored as ``NULL`` (so the case-insensitive unique
        constraint ignores it); any other value is stripped and lowercased.
        """
        if self.email == "":
            self.email = None
        elif self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        """Return the username."""
        return self.username
