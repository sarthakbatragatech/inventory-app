export function deriveItemFamily(itemName: string, sku?: string | null): string | null {
  const skuParts = sku?.split('-').filter(Boolean) ?? [];
  if (skuParts.length >= 2 && skuParts[0] !== 'TEMP') {
    return `${skuParts[0]}-${skuParts[1]}`;
  }

  const trimmedName = itemName.trim();
  if (!trimmedName) {
    return null;
  }

  const prefixedMatch = trimmedName.match(/^([A-Z]{1,3}-\d{2,4})\b/i);
  if (prefixedMatch) {
    return prefixedMatch[1].toUpperCase();
  }

  const numberFirstMatch = trimmedName.match(/^(\d{3,4})\b/);
  if (numberFirstMatch) {
    return numberFirstMatch[1];
  }

  const wordMatch = trimmedName.match(/^([A-Z]{2,})\b/i);
  if (wordMatch) {
    return wordMatch[1].toUpperCase();
  }

  return null;
}
