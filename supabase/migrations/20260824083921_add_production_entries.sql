create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  bom_model_id uuid not null references public.bom_models(id) on delete restrict,
  production_date date not null,
  color_variant text not null check (char_length(trim(color_variant)) > 0),
  quantity integer not null default 0 check (quantity >= 0),
  packed_quantity integer not null default 0 check (packed_quantity >= 0),
  report_reference text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (quantity > 0 or packed_quantity > 0)
);

create index production_entries_model_date_idx
  on public.production_entries (bom_model_id, production_date desc);

alter table public.production_entries enable row level security;

revoke all on table public.production_entries from anon, authenticated;
grant select, insert, update, delete on table public.production_entries to service_role;

alter table public.bom_lines
  add column if not exists consumption_stage text not null default 'assembled'
  check (consumption_stage in ('assembled', 'packed'));

create table public.bom_variant_lines (
  id uuid primary key default gen_random_uuid(),
  bom_version_id uuid not null references public.bom_versions(id) on delete cascade,
  color_variant text not null check (char_length(trim(color_variant)) > 0),
  component_item_id uuid not null references public.items(id) on delete restrict,
  component_sku text not null,
  component_name text not null,
  qty_per_fg numeric not null check (qty_per_fg > 0),
  unit text,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (bom_version_id, color_variant, component_item_id)
);

create index bom_variant_lines_version_color_idx
  on public.bom_variant_lines (bom_version_id, color_variant, sort_order);

alter table public.bom_variant_lines enable row level security;

revoke all on table public.bom_variant_lines from anon, authenticated;
grant select, insert, update, delete on table public.bom_variant_lines to service_role;

create table public.item_inward_mappings (
  id uuid primary key default gen_random_uuid(),
  normalized_item_name text not null,
  color text not null,
  item_id uuid not null references public.items(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (normalized_item_name, color)
);

create index item_inward_mappings_name_idx
  on public.item_inward_mappings (normalized_item_name);

alter table public.item_inward_mappings enable row level security;

revoke all on table public.item_inward_mappings from anon, authenticated;
grant select, insert, update, delete on table public.item_inward_mappings to service_role;

insert into public.item_families (code, name, notes)
values (
  'FR-001',
  'FR-001 / Cruzer',
  'FR-Cruzer component family seeded from the supplied July 2026 planning workbooks.'
)
on conflict (code) do update
set name = excluded.name;

with source_items (sku, item_name, category, default_unit, color_tracked, notes) as (
  values
    ('FR001-2121-R', 'FR-001 (2121) Body Right', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2121-L', 'FR-001 (2121) Body Left', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2122', 'FR-001 (2122)Front and rear covers', 'plastic_part', 'set', false, 'Shared BOM component'),
    ('FR001-2123-BROWN', 'FR-001 (2123)Seat', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2125-BROWN', 'FR-001 (2125) Backrest', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2126-BROWN', 'FR-001 (2126) Guard bar', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2130', 'FR-001 (2130) Front shield', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2131', 'FR-001 (2131) Rearview mirror', 'plastic_part', 'set', false, 'Shared BOM component'),
    ('FR001-2132', 'FR-001 (2132) Tail light housing', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2133', 'FR-001 (2133) Light housing', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2135', 'FR-001 ( 2135) Front fork trim', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2139', 'FR-001 (2139) Turn signal', 'plastic_part', 'set', false, 'Shared BOM component'),
    ('FR001-2140', 'FR-001 (2140) Headlight', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2141-BIG', 'FR-001 (2141) Wheel Big', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-2141-SMALL', 'FR-001 (2141) Wheel Small', 'plastic_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-HANDLE-GRIP', 'FR-001 Handle Grip', 'accessory', 'set', false, 'Shared BOM component'),
    ('FR001-OUTER', 'FR-001 Outer', 'packaging', 'pcs', false, 'Shared BOM component'),
    ('FR001-BACKREST-PIPE', 'FR-001 BackRest Supporter Pipe', 'metal_part', 'pcs', false, 'Shared BOM component'),
    ('FR001-WIRE-SET', 'FR 001 Wire Set', 'electronic', 'set', false, 'Electrical/other SKU listed in supplied planning sheet; inward naming to be confirmed'),
    ('FR001-IRON-FRAME', 'FR 001 Iron Part-Frame', 'metal_part', 'pcs', false, 'Electrical/other SKU listed in supplied planning sheet; inward naming to be confirmed'),
    ('FR001-DRIVE-MOTOR', 'FR 001 Drive Motor', 'electronic', 'pcs', false, 'Electrical/other SKU listed in supplied planning sheet; inward naming to be confirmed'),
    ('FR001-MP3', 'FR 001 MP3-Music Chip', 'electronic', 'pcs', false, 'Electrical/other SKU listed in supplied planning sheet; inward naming to be confirmed'),
    ('FR001-2127-WHITE', 'FR-001 (2127) Front fender (White)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2127-BLUE', 'FR-001 (2127) Front fender (Blue)', 'plastic_part', 'pcs', true, 'Aqua colour is recorded as Blue in the source workbook'),
    ('FR001-2127-GREEN', 'FR-001 (2127) Front fender (Green)', 'plastic_part', 'pcs', true, 'Military Green colour-dependent BOM component'),
    ('FR001-2127-RED', 'FR-001 (2127) Front fender (Red)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2128-BROWN', 'FR-001 (2128) Rear fender (Brown)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2128-WHITE', 'FR-001 (2128) Rear fender (White)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2129-BROWN', 'FR-001 (2129) Fuel tank trim (Brown)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2129-WHITE', 'FR-001 (2129) Fuel tank trim (White)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2136-WHITE', 'FR-001 (2136) Wheel cover (White)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2136-RED', 'FR-001 (2136) Wheel cover (Red)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2136-BLUE', 'FR-001 (2136) Wheel cover (Blue)', 'plastic_part', 'pcs', true, 'Aqua colour is recorded as Blue in the source workbook'),
    ('FR001-2136-GREEN', 'FR-001 (2136) Wheel cover (Green)', 'plastic_part', 'pcs', true, 'Military Green colour-dependent BOM component'),
    ('FR001-2137-BROWN', 'FR-001 (2137) Wheel shroud (Brown)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2137-RED', 'FR-001 (2137) Wheel shroud (Red)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2138-BROWN', 'FR-001 (2138) Switch (Brown)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component'),
    ('FR001-2138-RED', 'FR-001 (2138) Switch (Red)', 'plastic_part', 'pcs', true, 'Colour-dependent BOM component')
)
insert into public.items (
  sku,
  item_name,
  normalized_name,
  family,
  category,
  default_unit,
  color_tracked,
  notes,
  active
)
select
  source_items.sku,
  source_items.item_name,
  source_items.item_name,
  'FR-001',
  source_items.category,
  source_items.default_unit,
  source_items.color_tracked,
  source_items.notes,
  true
from source_items
on conflict (sku) do update
set
  item_name = excluded.item_name,
  normalized_name = excluded.normalized_name,
  family = excluded.family,
  category = excluded.category,
  default_unit = excluded.default_unit,
  color_tracked = excluded.color_tracked,
  notes = excluded.notes,
  active = true,
  updated_at = timezone('utc', now());

insert into public.item_family_links (item_id, family_code, is_primary)
select id, 'FR-001', true
from public.items
where sku like 'FR001-%'
on conflict (item_id, family_code) do update
set is_primary = true;

with source_mappings (normalized_item_name, color, component_sku) as (
  values
    ('FR-001 (2127) Front fender', 'WHITE', 'FR001-2127-WHITE'),
    ('FR-001 (2127) Front fender', 'BLUE', 'FR001-2127-BLUE'),
    ('FR-001 (2127) Front fender', 'GREEN', 'FR001-2127-GREEN'),
    ('FR-001 (2127) Front fender', 'RED', 'FR001-2127-RED'),
    ('FR-001 (2128) Rear fender', 'BROWN', 'FR001-2128-BROWN'),
    ('FR-001 (2128) Rear fender', 'WHITE', 'FR001-2128-WHITE'),
    ('FR-001 (2129) Fuel tank trim', 'BROWN', 'FR001-2129-BROWN'),
    ('FR-001 (2129) Fuel tank trim', 'WHITE', 'FR001-2129-WHITE'),
    ('FR-001 (2136) Wheel cover', 'WHITE', 'FR001-2136-WHITE'),
    ('FR-001 (2136) Wheel cover', 'RED', 'FR001-2136-RED'),
    ('FR-001 (2136) Wheel cover', 'BLUE', 'FR001-2136-BLUE'),
    ('FR-001 (2136) Wheel cover', 'GREEN', 'FR001-2136-GREEN'),
    ('FR-001 (2137) Wheel shroud', 'BROWN', 'FR001-2137-BROWN'),
    ('FR-001 (2137) Wheel shroud (Brown)', 'BROWN', 'FR001-2137-BROWN'),
    ('FR-001 (2137) Wheel shroud', 'RED', 'FR001-2137-RED'),
    ('FR-001 (2138) Switch', 'BROWN', 'FR001-2138-BROWN'),
    ('FR-001 (2138) Switch', 'RED', 'FR001-2138-RED')
)
insert into public.item_inward_mappings (
  normalized_item_name,
  color,
  item_id
)
select
  source_mappings.normalized_item_name,
  source_mappings.color,
  item.id
from source_mappings
join public.items item on item.sku = source_mappings.component_sku
on conflict (normalized_item_name, color) do update
set item_id = excluded.item_id;

with source_aliases (alias, component_sku) as (
  values
    ('FR 001 2121 Body Left Side', 'FR001-2121-L'),
    ('FR 001 2121 Body Right Side', 'FR001-2121-R'),
    ('FR 001 2122 Front and rear covers', 'FR001-2122'),
    ('FR 001 2123 Seat Brown', 'FR001-2123-BROWN'),
    ('FR 001 2125 Backrest Brown', 'FR001-2125-BROWN'),
    ('FR 001 2126 Guard bar Brown', 'FR001-2126-BROWN'),
    ('FR 001 2130 Front shield', 'FR001-2130'),
    ('FR 001 2131 Rearview mirror Set', 'FR001-2131'),
    ('FR 001 2132 Tail light housing', 'FR001-2132'),
    ('FR 001 2133 Light housing', 'FR001-2133'),
    ('FR 001 2135 Front fork trim', 'FR001-2135'),
    ('FR 001 2139 Turn signal/Indicator Cap', 'FR001-2139'),
    ('FR 001 2140 Headlight Glass', 'FR001-2140'),
    ('FR 001 2141 Wheel Big', 'FR001-2141-BIG'),
    ('FR 001 2141 Wheel Small', 'FR001-2141-SMALL'),
    ('FR 001 Handle Grip', 'FR001-HANDLE-GRIP'),
    ('Outer 001 Cruzer', 'FR001-OUTER'),
    ('Fr-001 iron part backrest support pipe', 'FR001-BACKREST-PIPE'),
    ('FR 001 2127 Front fender White', 'FR001-2127-WHITE'),
    ('FR 001 2127 Front fender Blue', 'FR001-2127-BLUE'),
    ('FR 001 2127 Front fender Green', 'FR001-2127-GREEN'),
    ('FR 001 2127 Front fender Red', 'FR001-2127-RED'),
    ('FR 001 2128 Rear fender Brown', 'FR001-2128-BROWN'),
    ('FR 001 2128 Rear fender White', 'FR001-2128-WHITE'),
    ('FR 001 2129 Fuel tank trim Brown', 'FR001-2129-BROWN'),
    ('FR 001 2129 Fuel tank trim White', 'FR001-2129-WHITE'),
    ('FR 001 2136 Wheel cover White', 'FR001-2136-WHITE'),
    ('FR 001 2136 Wheel cover Red', 'FR001-2136-RED'),
    ('FR 001 2136 Wheel cover Blue', 'FR001-2136-BLUE'),
    ('FR 001 2136 Wheel cover Green', 'FR001-2136-GREEN'),
    ('FR 001 2137 Wheel shroud Brown', 'FR001-2137-BROWN'),
    ('FR 001 2137 Wheel shroud Red', 'FR001-2137-RED'),
    ('FR 001 2138 Switch Brown', 'FR001-2138-BROWN'),
    ('FR 001 2138 Switch Red', 'FR001-2138-RED')
)
insert into public.item_aliases (item_id, alias, source, confidence)
select item.id, source_aliases.alias, 'inward', 1
from source_aliases
join public.items item on item.sku = source_aliases.component_sku
where not exists (
  select 1
  from public.item_aliases existing
  where existing.alias = source_aliases.alias
);

insert into public.bom_models (fg_sku, fg_name, source_item_id)
values ('FR-CRUZER', 'FR-Cruzer', null)
on conflict (fg_sku) do update
set
  fg_name = excluded.fg_name,
  updated_at = timezone('utc', now());

insert into public.bom_versions (bom_model_id, version_no, effective_from, notes)
select
  model.id,
  1,
  date '2026-07-13',
  'Initial FR-Cruzer BOM based on FIPL Stock Entry Final 20072026.xlsx and FR-001 Cruzer Stock Report.xlsx.'
from public.bom_models model
where model.fg_sku = 'FR-CRUZER'
  and not exists (
    select 1
    from public.bom_versions existing
    where existing.bom_model_id = model.id
      and existing.version_no = 1
  );

with shared_lines (component_sku, qty_per_fg, sort_order, notes) as (
  values
    ('FR001-2121-R', 1::numeric, 10, null::text),
    ('FR001-2121-L', 1::numeric, 20, null::text),
    ('FR001-2122', 1::numeric, 30, 'Front and rear cover set'),
    ('FR001-2123-BROWN', 1::numeric, 40, null::text),
    ('FR001-2125-BROWN', 1::numeric, 50, null::text),
    ('FR001-2126-BROWN', 1::numeric, 60, null::text),
    ('FR001-2130', 1::numeric, 70, null::text),
    ('FR001-2131', 1::numeric, 80, 'Rearview mirror set'),
    ('FR001-2132', 1::numeric, 90, null::text),
    ('FR001-2133', 1::numeric, 100, null::text),
    ('FR001-2135', 1::numeric, 110, null::text),
    ('FR001-2139', 1::numeric, 120, 'Turn signal / indicator cap set'),
    ('FR001-2140', 1::numeric, 130, null::text),
    ('FR001-2141-BIG', 1::numeric, 140, null::text),
    ('FR001-2141-SMALL', 1::numeric, 150, null::text),
    ('FR001-HANDLE-GRIP', 1::numeric, 160, 'Handle grip set'),
    ('FR001-OUTER', 1::numeric, 170, null::text),
    ('FR001-BACKREST-PIPE', 1::numeric, 180, 'Source stock quantity not present; confirm inward SKU naming'),
    ('FR001-WIRE-SET', 1::numeric, 190, 'Source stock quantity not present; confirm inward SKU naming'),
    ('FR001-IRON-FRAME', 1::numeric, 200, 'Source stock quantity not present; confirm inward SKU naming'),
    ('FR001-DRIVE-MOTOR', 1::numeric, 210, 'Source stock quantity not present; confirm inward SKU naming'),
    ('FR001-MP3', 1::numeric, 220, 'Source stock quantity not present; confirm inward SKU naming')
), target_version as (
  select version.id
  from public.bom_versions version
  join public.bom_models model on model.id = version.bom_model_id
  where model.fg_sku = 'FR-CRUZER'
    and version.version_no = 1
)
insert into public.bom_lines (
  bom_version_id,
  component_item_id,
  component_sku,
  component_name,
  qty_per_fg,
  unit,
  sort_order,
  notes
)
select
  target_version.id,
  item.id,
  item.sku,
  item.item_name,
  shared_lines.qty_per_fg,
  item.default_unit,
  shared_lines.sort_order,
  shared_lines.notes
from shared_lines
cross join target_version
join public.items item on item.sku = shared_lines.component_sku
where not exists (
  select 1
  from public.bom_lines existing
  where existing.bom_version_id = target_version.id
    and existing.component_item_id = item.id
);

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

with variant_lines (color_variant, component_sku, sort_order) as (
  values
    ('Red-White', 'FR001-2127-RED', 10),
    ('Red-White', 'FR001-2128-WHITE', 20),
    ('Red-White', 'FR001-2129-WHITE', 30),
    ('Red-White', 'FR001-2136-RED', 40),
    ('Red-White', 'FR001-2137-RED', 50),
    ('Red-White', 'FR001-2138-RED', 60),
    ('Aqua-Brown', 'FR001-2127-BLUE', 10),
    ('Aqua-Brown', 'FR001-2128-BROWN', 20),
    ('Aqua-Brown', 'FR001-2129-BROWN', 30),
    ('Aqua-Brown', 'FR001-2136-BLUE', 40),
    ('Aqua-Brown', 'FR001-2137-BROWN', 50),
    ('Aqua-Brown', 'FR001-2138-BROWN', 60),
    ('White-Brown', 'FR001-2127-WHITE', 10),
    ('White-Brown', 'FR001-2128-BROWN', 20),
    ('White-Brown', 'FR001-2129-BROWN', 30),
    ('White-Brown', 'FR001-2136-WHITE', 40),
    ('White-Brown', 'FR001-2137-BROWN', 50),
    ('White-Brown', 'FR001-2138-BROWN', 60),
    ('Military Green-Brown', 'FR001-2127-GREEN', 10),
    ('Military Green-Brown', 'FR001-2128-BROWN', 20),
    ('Military Green-Brown', 'FR001-2129-BROWN', 30),
    ('Military Green-Brown', 'FR001-2136-GREEN', 40),
    ('Military Green-Brown', 'FR001-2137-BROWN', 50),
    ('Military Green-Brown', 'FR001-2138-BROWN', 60)
), target_version as (
  select version.id
  from public.bom_versions version
  join public.bom_models model on model.id = version.bom_model_id
  where model.fg_sku = 'FR-CRUZER'
    and version.version_no = 1
)
insert into public.bom_variant_lines (
  bom_version_id,
  color_variant,
  component_item_id,
  component_sku,
  component_name,
  qty_per_fg,
  unit,
  sort_order,
  notes
)
select
  target_version.id,
  variant_lines.color_variant,
  item.id,
  item.sku,
  item.item_name,
  1,
  item.default_unit,
  variant_lines.sort_order,
  'Colour mapping from the supplied FR-001 Cruzer planning sheets.'
from variant_lines
cross join target_version
join public.items item on item.sku = variant_lines.component_sku
on conflict (bom_version_id, color_variant, component_item_id) do update
set
  component_sku = excluded.component_sku,
  component_name = excluded.component_name,
  qty_per_fg = excluded.qty_per_fg,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  notes = excluded.notes;
