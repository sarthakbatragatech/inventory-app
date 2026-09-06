/** Source evidence, not a replacement for the factory-approved BOM. */
export type CruzerPartReference = {
  photoUrl?: string;
  photoKind?: 'component' | 'mould';
  source: string;
  contents?: string;
  review?: string;
  searchTerms?: string;
};

const workbook = 'CRUSIER BIKE MOULDS.xlsx · Item List';
const mouldBook = 'FIPL Stock Entry Final 20072026.xlsx · Cruzer';
const photo = (part: string, cell: string, contents: string): CruzerPartReference => ({
  photoUrl: `/components/fr-cruzer/fr001-${part}.webp`, photoKind: 'component',
  source: `${workbook}!${cell}`, contents,
  searchTerms: part.startsWith('2127-') ? 'front tank panels fuel tank' : undefined,
});
const mould = (part: string, rows: string, contents: string): CruzerPartReference => ({
  photoUrl: `/components/fr-cruzer/fr001-${part}-mould.webp`, photoKind: 'mould',
  source: `${mouldBook} · rows ${rows}; kit photo: ${workbook}!${part === '2128' ? 'A12' : part === '2136' ? 'A21 / A23' : 'A27'}`,
  contents: `${contents} Mould layout only; its colour does not represent this variant.`,
});
const fenderKit = 'Mould kit includes the front mudguard and two front tank panels. On the red-white bike these panels are red, toward the handlebars.';
const rearKit = 'Source label: rear fender. Photo shows a multi-part kit, including oval side covers and console pieces; confirm the factory names.';
const tankKit = 'Four-piece trim kit, including the rear tank sections toward the seat. White on red-white; brown on the other three variants.';
const wheelCoverKit = 'The source photos show a ten-piece moulded kit. The blue kit weighs 65 g, consistent with the inward average per recorded count; do not multiply by the number of wheels.';
const switchKit = 'Multi-part moulded kit, not just one electrical switch. Exact fitting positions need factory confirmation.';
const ringContents = 'Factory-confirmed usage: 6 pcs per bike. Quantity corrected from 1 to 6; the assembly consumption stage is unchanged. The source photo shows a single wheel ring.';

export const FR_CRUZER_PART_REFERENCES: Record<string, CruzerPartReference> = {
  'FR001-2127-WHITE': photo('2127-white', 'A8', fenderKit),
  'FR001-2127-BLUE': photo('2127-blue', 'A9', fenderKit),
  'FR001-2127-GREEN': photo('2127-green', 'A10', fenderKit),
  'FR001-2127-RED': photo('2127-red', 'A11', fenderKit),
  'FR001-2128-BROWN': photo('2128-brown', 'A12', rearKit),
  'FR001-2128-WHITE': mould('2128', '11–12', rearKit),
  'FR001-2129-BROWN': photo('2129-brown', 'A14', tankKit),
  'FR001-2129-WHITE': photo('2129-white', 'A15', tankKit),
  'FR001-2136-BLUE': photo('2136-blue', 'A21', wheelCoverKit),
  'FR001-2136-RED': mould('2136', '20–21', wheelCoverKit),
  'FR001-2136-WHITE': photo('2136-white', 'A23', wheelCoverKit),
  'FR001-2136-GREEN': mould('2136', '20–21', wheelCoverKit),
  'FR001-2137-BROWN': { ...photo('2137-brown', 'A25', ringContents), source: `Factory instruction · 6 pcs per bike · 07 Sep 2026; photo: ${workbook}!A25` },
  'FR001-2137-RED': { ...photo('2137-red', 'A26', ringContents), source: `Factory instruction · 6 pcs per bike · 07 Sep 2026; photo: ${workbook}!A26` },
  'FR001-2138-BROWN': photo('2138-brown', 'A27', switchKit),
  'FR001-2138-RED': mould('2138', '24–25', switchKit),
  'FR001-HANDLE-GRIP': {
    source: `${workbook}!A33; Inward!D78:G78`,
    review: 'Confirm 2 pcs per packed bike. Inward is 7,250 recorded pcs at 24.5 g per count; the photo shows two grips weighing 49 g, suggesting the inward counts individual grips. The portal currently treats 1 set as 1 inward piece. Consumption is unchanged.',
  },
  'FR001-2141-BIG': {
    source: `${workbook}!A31, U20:X20`,
    review: 'Confirm 3 big wheel halves per bike, rather than 1. The source divides the matched big/small count by 3. It consumes at packing; the portal uses assembly. Confirm the stage too. Consumption is unchanged.',
  },
  'FR001-2141-SMALL': {
    source: `${workbook}!A32, U20:X20`,
    review: 'Confirm 3 small wheel halves per bike, rather than 1. The source divides the matched big/small count by 3. It consumes at packing; the portal uses assembly. Confirm the stage too. Consumption is unchanged.',
  },
  'FR001-2122': { source: `${workbook}!A4`, contents: 'Front/rear cover pair: the complete photographed kit weighs about 161 g, matching the inward average per count. One set is plausible.' },
  'FR001-2131': { source: `${workbook}!A17`, contents: 'Four mirror shell halves form a pair of mirrors. The whole kit weighs 76 g, matching the inward average per count. One set is plausible.' },
  'FR001-2133': { source: `${workbook}!A19`, contents: 'The photographed light-housing kit weighs 108 g, matching the inward average per count. One kit is plausible.' },
  'FR001-2135': { source: `${workbook}!A20`, contents: 'Multiple fork-trim parts form the photographed 150 g kit, matching the inward average per count. One kit is plausible.' },
  'FR001-2139': { source: `${workbook}!A29`, contents: 'Four indicator caps together weigh 14 g, matching the inward average per count. One four-cap set is plausible.' },
  'FR001-BACKREST-PIPE': { source: 'Factory instruction · 2 pcs per bike', contents: 'Already set to 2 pcs per bike, as confirmed by you.' },
};
