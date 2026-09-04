update public.bom_lines line
set
  qty_per_fg = 2,
  notes = 'Two BackRest Supporter Pipes are required per FR-Cruzer bike.'
from public.bom_versions version
join public.bom_models model on model.id = version.bom_model_id
where line.bom_version_id = version.id
  and model.fg_sku = 'FR-CRUZER'
  and line.component_sku = 'FR001-BACKREST-PIPE';

