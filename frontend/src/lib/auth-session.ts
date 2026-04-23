import type { AuthResponse } from "@/lib/auth-client";

export type StoredAuthUser = {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
};

export type AuthSessionSnapshot = {
  token: string | null;
  user: StoredAuthUser | null;
};

const ACCESS_TOKEN_KEY = "grid-sync.accessToken";
const USER_KEY = "grid-sync.user";
const AUTH_SESSION_EVENT = "grid-sync-auth-session-change";

const EMPTY_AUTH_SESSION_SNAPSHOT: AuthSessionSnapshot = {
  token: null,
  user: null,
};

let cachedAuthSessionSnapshot: AuthSessionSnapshot = EMPTY_AUTH_SESSION_SNAPSHOT;

function emitAuthSessionChange(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

function areUsersEqual(
  current: StoredAuthUser | null,
  next: StoredAuthUser | null,
): boolean {
  if (current === next) {
    return true;
  }

  if (current === null || next === null) {
    return false;
  }

  return (
    current.user_id === next.user_id &&
    current.first_name === next.first_name &&
    current.last_name === next.last_name &&
    current.email === next.email &&
    current.role === next.role
  );
}

export function saveAuthSession(payload: AuthResponse): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.access_token);
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      user_id: payload.user_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email,
      role: payload.role,
    }),
  );

  emitAuthSessionChange();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredUser(): StoredAuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuthUser;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);

  emitAuthSessionChange();
}

export function subscribeAuthSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(AUTH_SESSION_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(AUTH_SESSION_EVENT, onStoreChange);
  };
}

export function getAuthSessionSnapshot(): AuthSessionSnapshot {
  const token = getAccessToken();
  const user = getStoredUser();

  if (
    cachedAuthSessionSnapshot.token === token &&
    areUsersEqual(cachedAuthSessionSnapshot.user, user)
  ) {
    return cachedAuthSessionSnapshot;
  }

  cachedAuthSessionSnapshot = { token, user };
  return cachedAuthSessionSnapshot;
}

export function getServerAuthSessionSnapshot(): AuthSessionSnapshot {
  return EMPTY_AUTH_SESSION_SNAPSHOT;
}
