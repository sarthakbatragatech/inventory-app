-- Factory confirmation: six individual 2137 wheel rings per FR-Cruzer bike.
-- Filename matches the applied production migration version.
-- Correct the existing planning BOM; recorded production is not rewritten.
do $$
declare
  affected integer;
begin
  update public.bom_variant_lines line
  set qty_per_fg = 6,
      notes = case
        when coalesce(line.notes, '') like '%Factory-confirmed 2026-09-07: 6 wheel rings per bike.%' then line.notes
        else concat_ws(E'\n', nullif(line.notes, ''), 'Factory-confirmed 2026-09-07: 6 wheel rings per bike. Assembly consumption retained.')
      end
  from public.bom_versions version
  join public.bom_models model on model.id = version.bom_model_id
  where line.bom_version_id = version.id
    and model.fg_sku = 'FR-CRUZER'
    and version.version_no = 1
    and (
      (line.component_sku = 'FR001-2137-RED' and line.color_variant = 'Red-White')
      or (line.component_sku = 'FR001-2137-BROWN' and line.color_variant in ('Aqua-Brown', 'White-Brown', 'Military Green-Brown'))
    );
  get diagnostics affected = row_count;
  if affected <> 4 then
    raise exception 'Expected exactly 4 FR-Cruzer wheel-ring BOM lines, found %', affected;
  end if;
end
$$;
