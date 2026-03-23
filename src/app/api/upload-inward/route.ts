import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { deriveItemFamily } from '@/lib/item-family';
import { parseInwardWorkbook, type ParsedInwardRow } from '@/lib/inward-parser';
import { getSupabaseServerClient } from '@/lib/supabase';

const QUERY_CHUNK_SIZE = 200;
const INSERT_CHUNK_SIZE = 500;
const DEFAULT_ITEM_CATEGORY = 'raw_material';
const DEFAULT_ITEM_UNIT = 'pcs';

type AliasRecord = {
  alias: string;
  item_id: string;
};

type ItemRecord = {
  id: string;
  sku?: string;
  item_name?: string;
  normalized_name: string;
  family?: string | null;
};

type ItemQuantityProfile = {
  totalPcs: number;
  totalKgs: number;
};

type ItemFamilyRecord = {
  code: string;
};

type BatchRowRecord = {
  batch_id: string;
};

function normalizedComparisonKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function createTemporarySku(normalizedItemName: string): string {
  const slug = normalizedItemName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `TEMP-${slug || 'ITEM'}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function toItemDefaultUnit(unit: string | null): string {
  if (unit === 'KGS') {
    return 'kg';
  }

  return 'pcs';
}

function resolveItemFamilyCode(
  itemName: string,
  validFamilyCodes: Set<string>,
  sku?: string | null
): string | null {
  const candidateCodes = new Set<string>();
  const derivedFamily = deriveItemFamily(itemName, sku)?.trim().toUpperCase();

  if (derivedFamily) {
    candidateCodes.add(derivedFamily);

    const prefixedMatch = derivedFamily.match(/^([A-Z]{1,3})-\d{2,4}$/);
    if (prefixedMatch) {
      candidateCodes.add(prefixedMatch[1]);
    }
  }

  const itemNamePrefixMatch = itemName.trim().toUpperCase().match(/^([A-Z]{1,3})-\d{2,4}\b/);
  if (itemNamePrefixMatch) {
    candidateCodes.add(itemNamePrefixMatch[1]);
  }

  for (const candidateCode of candidateCodes) {
    if (validFamilyCodes.has(candidateCode)) {
      return candidateCode;
    }
  }

  return null;
}

function getRawPayloadNumber(
  rawPayload: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = rawPayload[key];
    if (value === null || value === undefined || value === '') {
      continue;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value).replace(/[^\d.-]/g, '');
    if (!normalized) {
      continue;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeParsedRowQuantities(parsedRows: ParsedInwardRow[]) {
  const profileByItem = new Map<string, ItemQuantityProfile>();

  for (const row of parsedRows) {
    const pcs = getRawPayloadNumber(row.rawPayload, ['Pcs', 'Qty', 'Quantity', 'qty']);
    const kgs = getRawPayloadNumber(row.rawPayload, ['Kgs']);

    if (pcs === null || kgs === null || pcs <= 0 || kgs <= 0) {
      continue;
    }

    const existing = profileByItem.get(row.normalizedItemName) ?? {
      totalPcs: 0,
      totalKgs: 0,
    };

    existing.totalPcs += pcs;
    existing.totalKgs += kgs;
    profileByItem.set(row.normalizedItemName, existing);
  }

  return parsedRows.map((row) => {
    const pcs = getRawPayloadNumber(row.rawPayload, ['Pcs', 'Qty', 'Quantity', 'qty']);
    const kgs = getRawPayloadNumber(row.rawPayload, ['Kgs']);
    const avgWeight = getRawPayloadNumber(row.rawPayload, ['Avg W, In Kgs']);

    if (pcs !== null && pcs > 0) {
      return {
        ...row,
        quantity: pcs,
        unit: 'PCS',
      };
    }

    if (kgs !== null && kgs > 0) {
      const profile = profileByItem.get(row.normalizedItemName);
      const inferredKgPerPc =
        avgWeight && avgWeight > 0
          ? avgWeight
          : profile && profile.totalPcs > 0 && profile.totalKgs > 0
            ? profile.totalKgs / profile.totalPcs
            : null;

      if (inferredKgPerPc && inferredKgPerPc > 0) {
        return {
          ...row,
          quantity: Math.round(kgs / inferredKgPerPc),
          unit: 'PCS',
        };
      }

      return {
        ...row,
        quantity: kgs,
        unit: 'KGS',
      };
    }

    return row;
  });
}

async function fetchAliases(rawItemNames: string[]) {
  const supabase = getSupabaseServerClient();
  const aliases: AliasRecord[] = [];

  for (const chunk of chunkArray(rawItemNames, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('item_aliases')
      .select('alias, item_id')
      .in('alias', chunk);

    if (error) {
      throw new Error(`Alias lookup failed: ${error.message}`);
    }

    aliases.push(...((data ?? []) as AliasRecord[]));
  }

  return aliases;
}

async function fetchItems(normalizedItemNames: string[]) {
  const supabase = getSupabaseServerClient();
  const items: ItemRecord[] = [];

  for (const chunk of chunkArray(normalizedItemNames, QUERY_CHUNK_SIZE)) {
    const candidates = [
      ...new Set(chunk.flatMap((name) => [name, name.toUpperCase(), name.toLowerCase()])),
    ];

    const { data, error } = await supabase
      .from('items')
      .select('id, normalized_name')
      .in('normalized_name', candidates);

    if (error) {
      throw new Error(`Item lookup failed: ${error.message}`);
    }

    items.push(...((data ?? []) as ItemRecord[]));
  }

  return items;
}

async function fetchItemFamilyCodes() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('item_families')
    .select('code');

  if (error) {
    throw new Error(`Item family lookup failed: ${error.message}`);
  }

  return new Set(
    ((data ?? []) as ItemFamilyRecord[]).map((record) => record.code.trim().toUpperCase())
  );
}

async function insertMissingItems(
  normalizedItemNames: string[],
  defaultUnitByNormalizedName: Map<string, string>,
  validFamilyCodes: Set<string>
) {
  if (!normalizedItemNames.length) {
    return [] as ItemRecord[];
  }

  const supabase = getSupabaseServerClient();
  const payload = normalizedItemNames.map((normalizedItemName) => ({
    family: resolveItemFamilyCode(normalizedItemName, validFamilyCodes),
    sku: createTemporarySku(normalizedItemName),
    item_name: normalizedItemName,
    normalized_name: normalizedItemName,
    category: DEFAULT_ITEM_CATEGORY,
    default_unit:
      defaultUnitByNormalizedName.get(normalizedItemName) ?? DEFAULT_ITEM_UNIT,
  }));

  const insertedItems: ItemRecord[] = [];

  for (const chunk of chunkArray(payload, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('items')
      .insert(chunk)
      .select('id, sku, item_name, normalized_name, family');

    if (error) {
      throw new Error(`Item insert failed: ${error.message}`);
    }

    insertedItems.push(...((data ?? []) as ItemRecord[]));
  }

  return insertedItems;
}

async function upsertPrimaryItemFamilyLinks(items: ItemRecord[]) {
  const payload = items
    .filter((item) => item.family)
    .map((item) => ({
      item_id: item.id,
      family_code: item.family as string,
      is_primary: true,
    }));

  if (!payload.length) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('item_family_links')
    .upsert(payload, { onConflict: 'item_id,family_code' });

  if (!error) {
    return;
  }

  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.message.includes('item_family_links') ||
    error.message.includes('does not exist')
  ) {
    return;
  }

  throw new Error(`Item family link insert failed: ${error.message}`);
}

async function upsertAliases(aliasRows: Array<{ alias: string; item_id: string }>) {
  if (!aliasRows.length) {
    return;
  }

  const supabase = getSupabaseServerClient();

  for (const chunk of chunkArray(aliasRows, INSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('item_aliases')
      .upsert(chunk, { onConflict: 'item_id,alias' });

    if (error) {
      throw new Error(`Alias insert failed: ${error.message}`);
    }
  }
}

async function insertImportRows(
  batchId: string,
  parsedRows: ParsedInwardRow[],
  itemIdByRawName: Map<string, string>,
  itemIdByNormalizedName: Map<string, string>
) {
  const supabase = getSupabaseServerClient();

  const payload = parsedRows.flatMap((row) => {
    const itemId =
      itemIdByRawName.get(row.rawItemName) ??
      itemIdByNormalizedName.get(
        normalizedComparisonKey(row.normalizedItemName)
      );

    if (!itemId) {
      return [];
    }

    return [
      {
        batch_id: batchId,
        raw_row_no: row.rawRowNo,
        raw_item_name: row.rawItemName,
        normalized_item_name: row.normalizedItemName,
        item_id: itemId,
        inward_date: row.inwardDate,
        quantity: row.quantity,
        unit: row.unit,
        color: row.color,
        raw_payload: row.rawPayload,
      },
    ];
  });

  for (const chunk of chunkArray(payload, INSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('import_batch_rows').insert(chunk);

    if (error) {
      throw new Error(`Row insert failed: ${error.message}`);
    }
  }

  return payload.length;
}

async function findProcessedBatchesWithOverlappingDates(inwardDates: string[]) {
  if (!inwardDates.length) {
    return [] as string[];
  }

  const supabase = getSupabaseServerClient();
  const overlappingBatchIds = new Set<string>();

  for (const dateChunk of chunkArray(inwardDates, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('import_batch_rows')
      .select('batch_id')
      .in('inward_date', dateChunk);

    if (error) {
      throw new Error(`Overlapping inward-date lookup failed: ${error.message}`);
    }

    for (const row of (data ?? []) as BatchRowRecord[]) {
      overlappingBatchIds.add(row.batch_id);
    }
  }

  if (!overlappingBatchIds.size) {
    return [];
  }

  const processedBatchIds = new Set<string>();

  for (const batchChunk of chunkArray([...overlappingBatchIds], QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('import_batches')
      .select('id')
      .eq('status', 'processed')
      .in('id', batchChunk);

    if (error) {
      throw new Error(`Processed batch lookup failed: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ id: string }>) {
      processedBatchIds.add(row.id);
    }
  }

  return [...processedBatchIds];
}

async function deleteOverlappingProcessedRows(
  batchIds: string[],
  inwardDates: string[]
) {
  if (!batchIds.length || !inwardDates.length) {
    return 0;
  }

  const supabase = getSupabaseServerClient();
  let deletedRowCount = 0;

  for (const batchChunk of chunkArray(batchIds, QUERY_CHUNK_SIZE)) {
    for (const dateChunk of chunkArray(inwardDates, QUERY_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from('import_batch_rows')
        .delete()
        .in('batch_id', batchChunk)
        .in('inward_date', dateChunk)
        .select('batch_id');

      if (error) {
        throw new Error(`Overlapping inward row cleanup failed: ${error.message}`);
      }

      deletedRowCount += (data ?? []).length;
    }
  }

  return deletedRowCount;
}

async function deleteNowEmptyProcessedBatches(batchIds: string[]) {
  if (!batchIds.length) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const batchIdsWithRows = new Set<string>();

  for (const batchChunk of chunkArray(batchIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('import_batch_rows')
      .select('batch_id')
      .in('batch_id', batchChunk);

    if (error) {
      throw new Error(`Residual batch row lookup failed: ${error.message}`);
    }

    for (const row of (data ?? []) as BatchRowRecord[]) {
      batchIdsWithRows.add(row.batch_id);
    }
  }

  const emptyBatchIds = batchIds.filter((batchId) => !batchIdsWithRows.has(batchId));
  if (!emptyBatchIds.length) {
    return;
  }

  for (const batchChunk of chunkArray(emptyBatchIds, QUERY_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('import_batches')
      .delete()
      .in('id', batchChunk);

    if (error) {
      throw new Error(`Empty batch cleanup failed: ${error.message}`);
    }
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  let batchId: string | null = null;

  try {
    const formData = await req.formData();

    const fileEntry = formData.get('file');
    const importedOnDateEntry = formData.get('importedOnDate');
    const notesEntry = formData.get('notes');

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const importedOnDate =
      typeof importedOnDateEntry === 'string' && importedOnDateEntry.trim()
        ? importedOnDateEntry.trim()
        : null;

    const notes =
      typeof notesEntry === 'string' && notesEntry.trim()
        ? notesEntry.trim()
        : null;

    const bytes = await fileEntry.arrayBuffer();
    const parsedRows = normalizeParsedRowQuantities(
      parseInwardWorkbook(Buffer.from(bytes))
    );

    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        file_name: fileEntry.name,
        imported_on_date: importedOnDate,
        notes,
        status: 'processing',
      })
      .select('id')
      .single();

    if (batchError || !batch?.id) {
      return NextResponse.json(
        { error: `Batch insert failed: ${batchError?.message ?? 'Unknown error'}` },
        { status: 500 }
      );
    }

    const currentBatchId = batch.id;
    batchId = currentBatchId;

    const uniqueRawItemNames = [...new Set(parsedRows.map((row) => row.rawItemName))];
    const uniqueNormalizedItemNames = [
      ...new Set(parsedRows.map((row) => row.normalizedItemName)),
    ];
    const defaultUnitByNormalizedName = new Map<string, string>();

    for (const row of parsedRows) {
      if (row.unit && !defaultUnitByNormalizedName.has(row.normalizedItemName)) {
        defaultUnitByNormalizedName.set(
          row.normalizedItemName,
          toItemDefaultUnit(row.unit)
        );
      }
    }

    const aliasRecords = await fetchAliases(uniqueRawItemNames);
    const itemRecords = await fetchItems(uniqueNormalizedItemNames);
    const validFamilyCodes = await fetchItemFamilyCodes();

    const itemIdByRawName = new Map(
      aliasRecords.map((record) => [record.alias, record.item_id])
    );
    const itemIdByNormalizedName = new Map(
      itemRecords.map((record) => [
        normalizedComparisonKey(record.normalized_name),
        record.id,
      ])
    );

    const missingNormalizedItemNames = uniqueNormalizedItemNames.filter(
      (normalizedItemName) =>
        !itemIdByNormalizedName.has(normalizedComparisonKey(normalizedItemName))
    );

    const insertedItems = await insertMissingItems(
      missingNormalizedItemNames,
      defaultUnitByNormalizedName,
      validFamilyCodes
    );
    await upsertPrimaryItemFamilyLinks(insertedItems);

    for (const item of insertedItems) {
      itemIdByNormalizedName.set(
        normalizedComparisonKey(item.normalized_name),
        item.id
      );
    }

    const aliasRows = uniqueRawItemNames.flatMap((rawItemName) => {
      if (itemIdByRawName.has(rawItemName)) {
        return [];
      }

      const sourceRow = parsedRows.find((row) => row.rawItemName === rawItemName);
      if (!sourceRow) {
        return [];
      }

      const itemId = itemIdByNormalizedName.get(
        normalizedComparisonKey(sourceRow.normalizedItemName)
      );
      if (!itemId) {
        return [];
      }

      itemIdByRawName.set(rawItemName, itemId);

      return [{ alias: rawItemName, item_id: itemId }];
    });

    await upsertAliases(aliasRows);

    const insertedRowCount = await insertImportRows(
      currentBatchId,
      parsedRows,
      itemIdByRawName,
      itemIdByNormalizedName
    );

    const incomingInwardDates = [
      ...new Set(parsedRows.map((row) => row.inwardDate).filter((value): value is string => Boolean(value))),
    ];
    const overlappingProcessedBatchIds = (
      await findProcessedBatchesWithOverlappingDates(incomingInwardDates)
    ).filter((existingBatchId) => existingBatchId !== currentBatchId);
    const overwrittenRowCount = await deleteOverlappingProcessedRows(
      overlappingProcessedBatchIds,
      incomingInwardDates
    );

    const { error: batchUpdateError } = await supabase
      .from('import_batches')
      .update({ status: 'processed' })
      .eq('id', currentBatchId);

    if (batchUpdateError) {
      throw new Error(`Batch update failed: ${batchUpdateError.message}`);
    }

    await deleteNowEmptyProcessedBatches(overlappingProcessedBatchIds);

    return NextResponse.json({
      success: true,
      batchId: currentBatchId,
      rowsImported: insertedRowCount,
      uniqueItemsMatched: uniqueNormalizedItemNames.length,
      newItemsCreated: insertedItems.length,
      newItems: insertedItems.map((item) => ({
        id: item.id,
        sku: item.sku ?? '',
        itemName: item.item_name ?? item.normalized_name,
        family: item.family ?? null,
      })),
      aliasesCreated: aliasRows.length,
      overwrittenRows: overwrittenRowCount,
      overwrittenDates: incomingInwardDates.length,
    });
  } catch (error) {
    if (batchId) {
      await supabase
        .from('import_batches')
        .update({
          status: 'failed',
          notes:
            error instanceof Error
              ? `Upload failed: ${error.message}`
              : 'Upload failed',
        })
        .eq('id', batchId);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}
