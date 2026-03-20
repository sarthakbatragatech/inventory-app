export interface Item {
  id: string;
  sku: string;
  item_name: string;
  normalized_name: string;
  created_at: string;
}

export interface ItemAlias {
  item_id: string;
  alias: string;
}

export interface ImportBatchRow {
  batch_id: string;
  raw_row_no: number;
  raw_item_name: string;
  normalized_item_name: string;
  item_id: string;
  inward_date: string;
  quantity: number;
  unit: string;
  color: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ItemWithDetails extends Item {
  item_aliases?: Array<{ alias: string }>;
  import_batch_rows?: Array<{ quantity: number; inward_date: string }>;
  totalQty: number;
  lastInward: string | null;
}

export interface UploadResponse {
  success: boolean;
  batchId: string;
  rowsImported: number;
  uniqueItemsMatched?: number;
  newItemsCreated?: number;
  aliasesCreated?: number;
  error?: string;
}

// Types for Supabase query responses
export interface SupabaseItemResponse {
  id: string;
  sku: string;
  item_name: string;
  normalized_name: string;
  created_at: string;
  item_aliases?: Array<{ alias: string }>;
  import_batch_rows?: Array<{ quantity: number; inward_date: string }>;
}
