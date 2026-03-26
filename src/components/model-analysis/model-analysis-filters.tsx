'use client';

type ModelFilterOption = {
  id: string;
  fg_sku: string;
  fg_name: string | null;
  families: string[];
};

export type ModelAnalysisFiltersProps = {
  models: ModelFilterOption[];
  initialQuery: string;
  initialFamily: string;
  initialFgSku: string;
};

// Temporary compatibility shim for stale dev-server module graphs.
// The merged stock page no longer uses this component.
export function ModelAnalysisFilters() {
  return null;
}
