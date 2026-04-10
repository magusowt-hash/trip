export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  return trimmed.replace(/[\s-]/g, '');
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{8,15}$/.test(phone) || /^1\d{10}$/.test(phone);
}
