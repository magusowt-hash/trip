export function parsePassportVisaFeeDisplay(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;

  const plainNumberMatch = normalized.match(/^\d+(?:\.\d+)?$/);
  if (plainNumberMatch) {
    return {
      amount: normalized,
      currencySymbol: '',
    };
  }

  const symbolNumberMatch = normalized.match(/^([^\d\s])(\d+(?:\.\d+)?)$/);
  if (!symbolNumberMatch) return null;

  return {
    currencySymbol: symbolNumberMatch[1],
    amount: symbolNumberMatch[2],
  };
}

export function parsePassportVisaStayDurationDisplay(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;

  const [primaryPartRaw, notePartRaw = ''] = normalized.split(/[，,]/, 2);
  const primaryPart = primaryPartRaw.trim();
  const note = notePartRaw.trim();
  const dayMatch = primaryPart.match(/^(\d+)天$/);

  if (!dayMatch) return null;

  return {
    days: dayMatch[1],
    note,
  };
}
