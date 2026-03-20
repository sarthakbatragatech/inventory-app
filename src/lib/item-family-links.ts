import { deriveItemFamily } from '@/lib/item-family';
import { getSupabaseServerClient } from '@/lib/supabase';

type ItemFamilyLinkRecord = {
  item_id: string;
  family_code: string;
  is_primary: boolean | null;
};

type FamilySourceItem = {
  id: string;
  item_name: string;
  sku: string;
  family: string | null;
};

export type ResolvedItemFamilies = {
  familyByItemId: Map<string, string[]>;
  hasFamilyLinksTable: boolean;
};

function normalizeFamilies(families: string[]) {
  return [...new Set(families.map((family) => family.trim()).filter(Boolean))];
}

export async function resolveItemFamilies(
  items: FamilySourceItem[]
): Promise<ResolvedItemFamilies> {
  const familyByItemId = new Map<string, string[]>();

  for (const item of items) {
    const fallbackFamily = item.family || deriveItemFamily(item.item_name, item.sku);
    familyByItemId.set(item.id, fallbackFamily ? [fallbackFamily] : []);
  }

  if (!items.length) {
    return { familyByItemId, hasFamilyLinksTable: false };
  }

  const supabase = getSupabaseServerClient();
  const itemIds = items.map((item) => item.id);
  const { data, error } = await supabase
    .from('item_family_links')
    .select('item_id, family_code, is_primary')
    .in('item_id', itemIds);

  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      error.message.includes('item_family_links') ||
      error.message.includes('does not exist')
    ) {
      return { familyByItemId, hasFamilyLinksTable: false };
    }

    throw new Error(`Item family links lookup failed: ${error.message}`);
  }

  const links = (data ?? []) as ItemFamilyLinkRecord[];
  const linksByItemId = new Map<string, ItemFamilyLinkRecord[]>();

  for (const link of links) {
    const existing = linksByItemId.get(link.item_id) ?? [];
    existing.push(link);
    linksByItemId.set(link.item_id, existing);
  }

  for (const item of items) {
    const itemLinks = linksByItemId.get(item.id) ?? [];
    if (!itemLinks.length) {
      continue;
    }

    const primaryLinks = itemLinks.filter((link) => link.is_primary);
    const orderedLinks = (primaryLinks.length ? primaryLinks : itemLinks)
      .map((link) => link.family_code);
    const secondaryLinks = itemLinks
      .filter((link) => !(primaryLinks.length && link.is_primary))
      .map((link) => link.family_code);

    familyByItemId.set(item.id, normalizeFamilies([...orderedLinks, ...secondaryLinks]));
  }

  return { familyByItemId, hasFamilyLinksTable: true };
}

