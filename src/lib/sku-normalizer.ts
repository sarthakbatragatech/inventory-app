export function normalizeItemName(input: string) {
  let name = input.trim();

  name = name.replace(/socker spring/gi, 'Shocker Spring');
  name = name.replace(/stering rod/gi, 'Steering Rod');
  name = name.replace(/stearing rod/gi, 'Steering Rod');
  name = name.replace(/staring motor/gi, 'Steering Motor');
  name = name.replace(/bonut/gi, 'Bonnet');
  name = name.replace(/smily/gi, 'Smiley');
  name = name.replace(/stephany/gi, 'Stepney');
  name = name.replace(/exal/gi, 'Axle');

  name = name.replace(/M\s*No\.?\s*(\d+)/gi, (_, n) => {
    return `Mould No. ${String(n).padStart(2, '0')}`;
  });

  return name.replace(/\s+/g, ' ').trim();
}