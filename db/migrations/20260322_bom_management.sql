create table if not exists public.bom_models (
  id uuid primary key default gen_random_uuid(),
  fg_sku text not null unique,
  fg_name text,
  source_item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bom_models_source_item_idx
  on public.bom_models (source_item_id);

create table if not exists public.bom_versions (
  id uuid primary key default gen_random_uuid(),
  bom_model_id uuid not null references public.bom_models(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  effective_from date not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (bom_model_id, version_no),
  unique (bom_model_id, effective_from)
);

create index if not exists bom_versions_model_effective_idx
  on public.bom_versions (bom_model_id, effective_from desc);

create table if not exists public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  bom_version_id uuid not null references public.bom_versions(id) on delete cascade,
  component_item_id uuid not null references public.items(id) on delete restrict,
  component_sku text not null,
  component_name text not null,
  qty_per_fg numeric(12,4) not null check (qty_per_fg > 0),
  unit text,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (bom_version_id, component_item_id)
);

create index if not exists bom_lines_version_sort_idx
  on public.bom_lines (bom_version_id, sort_order, component_sku);
