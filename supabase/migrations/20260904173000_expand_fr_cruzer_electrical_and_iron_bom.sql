with item_updates (current_name, canonical_sku, canonical_name, category, photo_url) as (
  values
    ('FR-001 Music Board', 'FR001-MUSIC-BOARD', 'FR-001 Music Board', 'electronic', '/components/fr-cruzer/fr001-mp3.webp'),
    ('FR-001 Speaker', 'FR001-SPEAKER', 'FR-001 Speaker', 'electronic', null),
    ('FR-001 Motor', 'FR001-MOTOR', 'FR-001 Motor', 'electronic', '/components/fr-cruzer/fr001-drive-motor.webp'),
    ('FR-001 Charging Wire', 'FR001-CHARGING-WIRE', 'FR-001 Charging Wire', 'electronic', null),
    ('FR-001 Padel Wire', 'FR001-PEDAL-WIRE', 'FR-001 Pedal Wire', 'electronic', null),
    ('FR-001 Head Light Wire', 'FR001-HEAD-LIGHT-WIRE', 'FR-001 Head Light Wire', 'electronic', null),
    ('FR-001 Main Wire', 'FR001-MAIN-WIRE', 'FR-001 Main Wire', 'electronic', null),
    ('FR-001 ON-OFF Button', 'FR001-ON-OFF-BUTTON', 'FR-001 ON-OFF Button', 'electronic', null),
    ('FR-001 Motor Button', 'FR001-MOTOR-BUTTON', 'FR-001 Motor Button', 'electronic', null),
    ('FR-001 Handle Rod Right', 'FR001-HANDLE-ROD-RIGHT', 'FR-001 Handle Rod Right', 'metal_part', null),
    ('FR-001 Handle Rod left', 'FR001-HANDLE-ROD-LEFT', 'FR-001 Handle Rod Left', 'metal_part', null),
    ('FR-001 Handle Supporter Pipe', 'FR001-HANDLE-SUPPORTER-PIPE', 'FR-001 Handle Supporter Pipe', 'metal_part', null),
    ('FR-001 Front Wheel Rod', 'FR001-FRONT-WHEEL-ROD', 'FR-001 Front Wheel Rod', 'metal_part', null),
    ('FR-001 Back Wheel Rod', 'FR001-BACK-WHEEL-ROD', 'FR-001 Back Wheel Rod', 'metal_part', null)
)
update public.items item
set
  sku = item_updates.canonical_sku,
  item_name = item_updates.canonical_name,
  normalized_name = item_updates.canonical_name,
  category = item_updates.category,
  photo_url = coalesce(item_updates.photo_url, item.photo_url),
  notes = coalesce(item.notes, 'FR-Cruzer BOM component received from China.'),
  updated_at = timezone('utc', now())
from item_updates
where item.item_name = item_updates.current_name;

with target_version as (
  select version.id
  from public.bom_versions version
  join public.bom_models model on model.id = version.bom_model_id
  where model.fg_sku = 'FR-CRUZER'
  order by version.effective_from desc, version.version_no desc
  limit 1
)
delete from public.bom_lines line
using target_version
where line.bom_version_id = target_version.id
  and line.component_sku in (
    'FR001-WIRE-SET',
    'FR001-IRON-FRAME',
    'FR001-DRIVE-MOTOR',
    'FR001-MP3'
  );

with target_version as (
  select version.id
  from public.bom_versions version
  join public.bom_models model on model.id = version.bom_model_id
  where model.fg_sku = 'FR-CRUZER'
  order by version.effective_from desc, version.version_no desc
  limit 1
),
component_lines (component_sku, qty_per_fg, unit, sort_order, notes) as (
  values
    ('FR001-MOTOR', 1::numeric, 'pcs', 190, 'Electrical subcomponent'),
    ('FR001-MUSIC-BOARD', 1::numeric, 'pcs', 200, 'Electrical subcomponent'),
    ('FR001-SPEAKER', 1::numeric, 'pcs', 210, 'Electrical subcomponent'),
    ('FR001-MAIN-WIRE', 1::numeric, 'pcs', 220, 'Electrical subcomponent'),
    ('FR001-PEDAL-WIRE', 1::numeric, 'pcs', 230, 'Electrical subcomponent'),
    ('FR001-CHARGING-WIRE', 1::numeric, 'pcs', 240, 'Electrical subcomponent'),
    ('FR001-HEAD-LIGHT-WIRE', 1::numeric, 'pcs', 250, 'Electrical subcomponent'),
    ('FR001-ON-OFF-BUTTON', 1::numeric, 'pcs', 260, 'Electrical subcomponent'),
    ('FR001-MOTOR-BUTTON', 1::numeric, 'pcs', 270, 'Electrical subcomponent'),
    ('FR001-HANDLE-ROD-RIGHT', 1::numeric, 'pcs', 280, 'Iron frame subcomponent'),
    ('FR001-HANDLE-ROD-LEFT', 1::numeric, 'pcs', 290, 'Iron frame subcomponent'),
    ('FR001-HANDLE-SUPPORTER-PIPE', 1::numeric, 'pcs', 300, 'Iron frame subcomponent'),
    ('FR001-FRONT-WHEEL-ROD', 1::numeric, 'pcs', 310, 'Iron frame subcomponent'),
    ('FR001-BACK-WHEEL-ROD', 1::numeric, 'pcs', 320, 'Iron frame subcomponent')
)
insert into public.bom_lines (
  bom_version_id,
  component_item_id,
  component_sku,
  component_name,
  qty_per_fg,
  unit,
  sort_order,
  consumption_stage,
  notes
)
select
  target_version.id,
  item.id,
  item.sku,
  item.item_name,
  component_lines.qty_per_fg,
  component_lines.unit,
  component_lines.sort_order,
  'assembled',
  component_lines.notes
from target_version
cross join component_lines
join public.items item on item.sku = component_lines.component_sku
where not exists (
  select 1
  from public.bom_lines existing
  where existing.bom_version_id = target_version.id
    and existing.component_item_id = item.id
);

