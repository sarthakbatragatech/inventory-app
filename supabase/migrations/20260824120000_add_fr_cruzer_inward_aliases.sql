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
