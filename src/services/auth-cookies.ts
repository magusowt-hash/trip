export function getAuthTokenFromCookies(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/trip_auth=([^;]+)/);
  return match ? match[1] : null;
}