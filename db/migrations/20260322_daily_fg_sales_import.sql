create table if not exists public.daily_fg_sales_import (
  sale_date date not null,
  fg_sku text not null,
  fg_name text,
  category text,
  qty integer not null,
  source_item_id uuid,
  imported_at timestamptz not null default now(),
  primary key (sale_date, fg_sku)
);
