create table if not exists public.item_family_links (
  item_id uuid not null references public.items(id) on delete cascade,
  family_code text not null references public.item_families(code) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (item_id, family_code)
);

create unique index if not exists item_family_links_primary_idx
  on public.item_family_links (item_id)
  where is_primary;

insert into public.item_family_links (item_id, family_code, is_primary)
select id, family, true
from public.items
where family is not null
on conflict (item_id, family_code)
do update set is_primary = excluded.is_primary;
