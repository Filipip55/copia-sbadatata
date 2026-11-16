/** Body of `POST /api/auth/register/`. */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  theme_preference?: 'light' | 'dark';
}

/** User returned after a successful sign-up. */
export interface RegisteredUser {
  id: number;
  username: string;
  email: string;
  theme_preference: 'light' | 'dark';
}

/** Body of `POST /api/auth/login/`. */
export interface LoginRequest {
  /** Username or email address. */
  username: string;
  password: string;
}

/** JWT pair returned by a successful login. */
export interface LoginResponse {
  access: string;
  refresh: string;
}

/** Tokens returned by `POST /api/auth/refresh/`. */
export interface RefreshResponse {
  access: string;
  /** Present only when refresh token rotation is enabled. */
  refresh?: string;
}

/** The authenticated user's profile (`/api/auth/me/`). */
export interface UserProfile {
  id: number;
  username: string;
  email: string | null;
  /** Index of the chosen avatar (0-5), or `null` for the default one. */
  avatar: number | null;
  theme_preference: 'light' | 'dark';
  /** ISO 8601 timestamp. */
  date_joined: string;
  favorites_count: number;
  wishlist_count: number;
  /** When the username can be changed again (ISO 8601), or `null` if it can be changed now. */
  username_change_available_at: string | null;
}

/** Body of `POST /api/auth/change-password/`. */
export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

/** Body of `POST /api/auth/change-username/`. */
export interface ChangeUsernameRequest {
  username: string;
}

/** DRF validation errors: field name to message(s); `detail` holds non-field errors. */
export interface ApiFieldErrors {
  [field: string]: string | string[];
}
