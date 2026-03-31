export const storage = {
  get<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};
