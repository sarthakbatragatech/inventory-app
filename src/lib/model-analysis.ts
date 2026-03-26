export const BH_MODEL_SKUS = new Set([
  'FR-208',
  'FR-208 PAINT',
  'FR-406',
  'FR-406 PAINT',
  'FR-406 PAINT PLUS',
  'FR-528',
  'FR-528 PAINT',
  'FR-528 PAINT PLUS',
  'FR-528 PLUS',
  'FR-606',
  'FR-606 PAINT',
  'FR-61',
  'FR-61 PAINT',
  'FR-728',
  'FR-728 PAINT',
  'FR-728 PAINT PLUS',
  'FR-728 PLUS',
  'FR-788',
  'FR-788 PAINT',
  'FR-788 PAINT PLUS',
  'FR-788 PLUS',
  'FR-908',
  'FR-908 PAINT',
  'FR-908 PAINT PLUS',
]);

export function deriveBaseModelFamily(fgSku: string, fgName: string | null) {
  const normalizedSku = fgSku.trim().toUpperCase();
  const skuMatch = normalizedSku.match(/^([A-Z]{1,3}-\d{2,4})\b/);
  if (skuMatch) {
    return skuMatch[1];
  }

  const nameMatch = (fgName ?? '').trim().toUpperCase().match(/^([A-Z]{1,3}-\d{2,4})\b/);
  return nameMatch?.[1] ?? '';
}

export function deriveModelFamilies(fgSku: string, fgName: string | null) {
  const normalizedSku = fgSku.trim().toUpperCase();
  const families = new Set<string>();
  const baseFamily = deriveBaseModelFamily(fgSku, fgName);

  if (baseFamily) {
    families.add(baseFamily);
  }

  if (BH_MODEL_SKUS.has(normalizedSku)) {
    families.add('BH');
  }

  return [...families];
}
