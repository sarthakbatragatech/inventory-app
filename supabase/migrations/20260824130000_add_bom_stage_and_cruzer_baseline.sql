alter table public.bom_lines
  add column if not exists consumption_stage text not null default 'assembled'
  check (consumption_stage in ('assembled', 'packed'));

update public.bom_lines line
set consumption_stage = 'packed'
from public.bom_versions version
join public.bom_models model on model.id = version.bom_model_id
where line.bom_version_id = version.id
  and model.fg_sku = 'FR-CRUZER'
  and line.component_sku in (
    'FR001-BACKREST-PIPE',
    'FR001-HANDLE-GRIP',
    'FR001-OUTER'
  );

with baseline_rows (production_date, color_variant, quantity, packed_quantity) as (
  values
    (date '2026-08-03', 'Aqua-Brown', 4, 0),
    (date '2026-08-03', 'Military Green-Brown', 31, 0),
    (date '2026-08-03', 'Red-White', 17, 0),
    (date '2026-08-04', 'White-Brown', 19, 0),
    (date '2026-08-04', 'Aqua-Brown', 8, 0),
    (date '2026-08-04', 'Military Green-Brown', 59, 0),
    (date '2026-08-04', 'Red-White', 15, 0),
    (date '2026-08-05', 'White-Brown', 77, 0),
    (date '2026-08-05', 'Military Green-Brown', 52, 0),
    (date '2026-08-06', 'White-Brown', 19, 0),
    (date '2026-08-06', 'Military Green-Brown', 17, 0),
    (date '2026-08-07', 'White-Brown', 41, 29),
    (date '2026-08-07', 'Military Green-Brown', 25, 0),
    (date '2026-08-07', 'Red-White', 46, 0),
    (date '2026-08-08', 'White-Brown', 56, 50),
    (date '2026-08-08', 'Aqua-Brown', 55, 0),
    (date '2026-08-08', 'Military Green-Brown', 42, 0),
    (date '2026-08-08', 'Red-White', 22, 0),
    (date '2026-08-10', 'White-Brown', 48, 0),
    (date '2026-08-10', 'Aqua-Brown', 42, 0),
    (date '2026-08-10', 'Military Green-Brown', 38, 0),
    (date '2026-08-10', 'Red-White', 27, 0),
    (date '2026-08-11', 'Aqua-Brown', 55, 0),
    (date '2026-08-11', 'Military Green-Brown', 31, 0),
    (date '2026-08-11', 'Red-White', 89, 0),
    (date '2026-08-12', 'Red-White', 88, 0),
    (date '2026-08-13', 'Red-White', 58, 0),
    (date '2026-08-14', 'White-Brown', 0, 5),
    (date '2026-08-14', 'Aqua-Brown', 0, 5),
    (date '2026-08-14', 'Military Green-Brown', 0, 5),
    (date '2026-08-14', 'Red-White', 103, 5),
    (date '2026-08-16', 'White-Brown', 0, 34),
    (date '2026-08-16', 'Aqua-Brown', 0, 38),
    (date '2026-08-16', 'Military Green-Brown', 0, 27),
    (date '2026-08-16', 'Red-White', 45, 100),
    (date '2026-08-17', 'Red-White', 47, 0),
    (date '2026-08-18', 'Red-White', 53, 0),
    (date '2026-08-19', 'Red-White', 71, 0),
    (date '2026-08-20', 'White-Brown', 0, 29),
    (date '2026-08-20', 'Aqua-Brown', 0, 141),
    (date '2026-08-20', 'Military Green-Brown', 0, 133),
    (date '2026-08-20', 'Red-White', 78, 174)
)
insert into public.production_entries (
  bom_model_id,
  production_date,
  color_variant,
  quantity,
  packed_quantity,
  report_reference,
  notes
)
select
  model.id,
  baseline_rows.production_date,
  baseline_rows.color_variant,
  baseline_rows.quantity,
  baseline_rows.packed_quantity,
  'CRUSIER BIKE MOULDS.xlsx',
  'Baseline imported from the Production sheet supplied on 24/08/2026.'
from baseline_rows
join public.bom_models model on model.fg_sku = 'FR-CRUZER'
where not exists (
  select 1
  from public.production_entries existing
  where existing.bom_model_id = model.id
    and existing.production_date = baseline_rows.production_date
    and existing.color_variant = baseline_rows.color_variant
    and existing.report_reference = 'CRUSIER BIKE MOULDS.xlsx'
);

insert into public.daily_fg_sales_import (
  sale_date,
  fg_sku,
  fg_name,
  category,
  qty,
  source_item_id,
  imported_at
)
values
  (date '2026-08-17', 'FR-CRUZER', 'FR-Cruzer', 'small bike', 73, null, timezone('utc', now())),
  (date '2026-08-18', 'FR-CRUZER', 'FR-Cruzer', 'small bike', 58, null, timezone('utc', now())),
  (date '2026-08-19', 'FR-CRUZER', 'FR-Cruzer', 'small bike', 10, null, timezone('utc', now())),
  (date '2026-08-20', 'FR-CRUZER', 'FR-Cruzer', 'small bike', 632, null, timezone('utc', now())),
  (date '2026-08-21', 'FR-CRUZER', 'FR-Cruzer', 'small bike', 2, null, timezone('utc', now()))
on conflict (sale_date, fg_sku) do nothing;
