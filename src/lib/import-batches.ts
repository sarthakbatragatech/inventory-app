export type BatchWithFileName = {
  id: string;
  file_name: string;
};

export function selectNewestBatchPerFileName<T extends BatchWithFileName>(batches: T[]) {
  const latestBatches: T[] = [];
  const seenFileNames = new Set<string>();

  for (const batch of batches) {
    if (seenFileNames.has(batch.file_name)) {
      continue;
    }

    seenFileNames.add(batch.file_name);
    latestBatches.push(batch);
  }

  return latestBatches;
}
