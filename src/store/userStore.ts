export type UserInfo = {
  id: string;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  gender: number;
  birthday: string | null;
  region: string | null;
};

const STORAGE_KEY = 'trip_user';

function getStoredUser(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeUser(user: UserInfo | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

let user: UserInfo | null = null;

export function setUser(next: UserInfo | null) {
  user = next;
  storeUser(next);
}

export function getUser() {
  if (!user) {
    user = getStoredUser();
  }
  return user;
}

export function getDefaultAvatar() {
  return '/default-avatar.svg';
}

export function isLoggedIn() {
  return Boolean(getUser());
}
