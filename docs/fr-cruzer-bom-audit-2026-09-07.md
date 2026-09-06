# FR-Cruzer BOM audit — 7 September 2026

The existing BOM is a useful planning model, but it is not yet a signed-off manufacturing specification. Source photographs and lot weights support several kit definitions and expose a handle-grip unit error. Wheel-half quantities and their consumption stage need factory confirmation. This audit does not change BOM records, stock, or production entries.

## Sources and scope

- Live `GET /api/bom?fgSku=FR-CRUZER`: BOM version 1, effective 13 July 2026; 32 shared lines and six lines per colour. Apart from two backrest pipes, all current quantities are one.
- Live `GET /api/production?fgSku=FR-CRUZER`, calculated at 02:02 IST on 7 September 2026: 1,802 assembled bikes, 1,362 packed bikes, and 1,139 further bikes requiring packing for open orders.
- `CRUSIER BIKE MOULDS.xlsx`: `Item List`, `Inward`, and `Production` sheets, including embedded component photographs.
- `FR-001 Cruzer Stock Report.xlsx`: `Planning` and `Report` sheets, used to cross-check lot quantities and weights.
- `FIPL Stock Entry Final 20072026.xlsx`: `Cruzer` planning sheet.
- `FR-CRUZER/DUMP` product photographs, including image groups 5860/5861 and 5844/5855.
- User confirmation that two BackRest Supporter Pipes are used in one bike.

Photographs establish what is visible and help interpret a counted kit. They do not establish hidden components, the factory's stock-count convention, or the point when a part is issued to production. Matching a photographed kit weight to an inward lot average is supporting evidence, not manufacturing sign-off.

## What red-white means

The colour name alone does not identify left and right tank halves. The existing configuration selects red 2127, white 2128 and 2129, and red 2136, 2137 and 2138. It contains no left/right or front/rear tank-position field.

The source photographs now give a more specific interpretation:

| Source | Observed contents | Meaning for the red-white bike |
| --- | --- | --- |
| `CRUSIER BIKE MOULDS.xlsx`, `Item List!A8:A11`, labels `H8:J11` | The 2127 kit contains the front fender and two coloured front tank panels. The red kit photograph shows about 0.120 kg, consistent with the measured kit weight. | The red front tank panels are already included in the red 2127 kit. Their absence as a separate red 2129 SKU does not demonstrate a missing component. |
| `Item List!A14:A15`, labels `H14:J15`; `Inward!D53:G54` | The 2129 photograph shows a four-piece trim kit including the rear tank pieces. The inward average is approximately 0.044 kg per counted kit. | The white 2129 kit supplies the white rear tank section. |
| DUMP product image groups 5860/5861; corroborating opposite-side views 5844/5855 | A red front tank section and a white rear section appear on the same visible side, with the corresponding arrangement on the other side. | The observed split is **front red / rear white**, not left red / right white. |

The workbook itself does not contain a finished-colour-to-position matrix. `Production!B1/D1/F1/H1` is labelled White / Blue / Green / Red, while planning rows list the available component colours. The original database note, “Colour mapping from the supplied FR-001 Cruzer planning sheets,” should not be read as evidence that every physical placement had been verified. Product photographs add that evidence for the visible red-white tank arrangement; factory confirmation is still appropriate for a formal assembly specification.

## Quantity and unit findings

| Component | Current BOM | Evidence and confidence | Action to confirm |
| --- | --- | --- | --- |
| Handle grip | 1 set, consumed at packing | **Strong correction candidate: 2 individual pieces.** `Inward!D78:G78` records 7,250 pieces at 177.62 kg, or 24.499 g each. The grip photograph shows two grips together weighing 49 g. The portal currently treats the unconverted 7,250-piece inward count as 7,250 sets. | Confirm the inward count means individual grips, then use 2 pcs/bike or explicitly convert all receipt quantities to two-grip sets. Retain the agreed packing stage unless the factory corrects it. |
| 2141 wheel big and wheel small | 1 pc of each, consumed at assembly | **Strong correction candidate: 3 big halves and 3 small halves.** The two photographs show complementary wheel shells. `Item List!U20 = MIN($L$31:$L$32)` and `X20 = (U20/3)-W20` explicitly divide matching halves by three. Receipts identify the halves separately; examples are `Inward!D34:G37`. | Confirm three of each per bike. Also confirm the stage: `Item List!W20 = Production!L2` uses packed bikes, while the portal consumes these parts at assembly. Quantity and stage must be settled together. |
| 2137 wheel shroud / ring | 1 pc per applicable colour, consumed at assembly | **Review candidate: 3 rings.** Embedded photographs at `Item List!A25:A26` show a single ring weighing about 13 g. Measured receipts `Inward!D61:G61`, `D64:G64`, `D67:G67`, and `D70:G70` average about 15 g per piece. Planning weights `Item List!C25:C26` and `Planning!E25:E26` are 44 g. Three rings are consistent with the per-bike material estimate and three-wheel construction, but weight alone does not prove usage. | Count rings on one completed bike and confirm whether their issue stage follows wheel fitting or packing. Do not multiply stock usage from the weight ratio alone. |
| 2136 wheel cover | 1 pc per applicable colour, consumed at assembly | **One kit is supported; do not multiply by three.** The blue and white photographs at `Item List!A21` and `A23` show a ten-piece kit weighing about 65 g in total. `Inward!D56:G56`, `D62:G62`, `D65:G66` also average about 65 g per counted receipt unit. | Clarify the label as one moulded kit and confirm its ten-piece contents. The receipt count already appears to count the whole kit. |
| 2131 rearview mirror | 1 set, consumed at assembly | **One set is supported.** The photograph shows the moulded halves for the mirror pair, together weighing 76 g. `Inward!D59:G59` and `D92:G92` average about 76 g per receipt unit. | Confirm one receipt unit means a complete mirror pair; retain one set if confirmed. |
| 2122 front and rear covers | 1 set, consumed at assembly | **One set is supported.** The photographed front/rear pair weighs 161 g; `FR-001 Cruzer Stock Report.xlsx`, `Report!D3:F3`, gives 493.75 kg / 3,067 = about 160.988 g per counted unit. | Confirm that each receipt count is the complete front/rear cover set. |
| 2135 front fork trim | 1 pc, consumed at assembly | **One kit is supported.** The photograph contains multiple moulded parts together weighing 150 g. `Inward!D60:G60` and `D76:G76` average about 150 g per receipt unit. | Improve the unit label to kit/set after confirming the stock-count convention. Multiple photographed pieces do not imply multiple receipt units. |
| 2133 light housing | 1 pc, consumed at assembly | **One kit is supported.** The photographed group weighs 108 g; `Report!D13:F13` gives 182.8 kg / 1,693 = about 107.974 g per counted unit. | Clarify the kit contents and label; do not multiply the quantity by the number of loose parts in the photo. |
| 2139 turn signal / indicator caps | 1 set, consumed at assembly | **One set is supported.** The photograph shows four red cap pieces together weighing 14 g. `Inward!D79:G79` and `D94:G94` average about 14 g per receipt unit. | Confirm one source count means the full photographed cap set. |
| BackRest Supporter Pipe | 2 pcs, consumed at packing | **Quantity confirmed by the user.** The current BOM implements the explicit two-pipes-per-bike instruction. | No quantity correction required. Packing-stage verification remains as previously discussed. |

The other shared rows are currently one each: body right, body left, seat, backrest, guard bar, front shield, tail-light housing, headlight, outer carton, motor, music board, speaker, main wire, pedal wire, charging wire, headlight wire, on/off button, motor button, right handle rod, left handle rod, handle supporter pipe, front wheel rod, and back wheel rod. This audit found no source evidence requiring another quantity for these rows. That is not proof that every item or subpart is covered. Colour-specific 2127, 2128, 2129 and 2138 remain one counted kit/piece per bike pending a complete factory specification.

## Planning effect of the principal candidates

These are comparison calculations, not changes to the live ledger. They use the snapshot above and do not account for additional unrecorded receipts, scrap, returns, or physical adjustments.

| Case | Computation | Result |
| --- | --- | --- |
| Handle grip, current portal | 7,250 − 1 × 1,362 packed | 5,888 displayed as stock, with a set/piece mismatch |
| Handle grip, 2 pcs at packing | 7,250 − 2 × 1,362 | 4,526 pcs, sufficient for 2,263 bikes |
| Handle grip, remaining packing requirement | 2 × 1,139 bikes | 2,278 pcs; no grip purchase shortage under this candidate |
| Big wheel halves, 3 pcs at assembly | 5,970 − 3 × 1,802 | 564 pcs, or 188 further bikes |
| Small wheel halves, 3 pcs at assembly | 6,240 − 3 × 1,802 | 834 pcs, or 278 further bikes |
| Big wheel halves, 3 pcs at packing | 5,970 − 3 × 1,362 | 1,884 pcs, or 628 further bikes |
| Small wheel halves, 3 pcs at packing | 6,240 − 3 × 1,362 | 2,154 pcs, or 718 further bikes |

This difference is why the wheel issue stage needs confirmation before recalculating consumption. The most useful factory check is one completed bike laid out against the BOM, with a count of individual parts, a definition of each moulded kit, and the stage at which each stock unit is issued.

## Completeness and duplication checks

- Battery, charger, screws, nuts and other fasteners are absent as explicit lines in this BOM. Confirm whether they are supplied inside an existing purchased assembly, stocked under shared SKUs, or still need adding. No quantities or stock balances should be invented for them.
- The old Wire Set, Iron Frame, Drive Motor and MP3 placeholders were removed when their inward-backed electrical and iron subcomponents were added. The current BOM does not consume both those placeholders and their replacements.
- A component labelled “headlight,” “switch,” or “light housing” may denote moulded plastic rather than a complete electrical assembly. Confirm the electrical contents against the actual assembly list before treating those labels as coverage of all lighting parts.
- Source headers alternate between `Pcs` and `Pcs/Set`. A useful final BOM must define the receipt unit explicitly for each row; changing a display label alone cannot repair an actual conversion error such as the grip count.

## Relevant implementation references

- `supabase/migrations/20260824083921_add_production_entries.sql:261`: initial shared quantities, including one wheel big, one wheel small, and one handle-grip set.
- `supabase/migrations/20260824083921_add_production_entries.sql:333`: finished-colour component selection; line 383 applies quantity one to every variant line.
- `supabase/migrations/20260904173000_expand_fr_cruzer_electrical_and_iron_bom.sql:38`: replacement of legacy placeholders; lines 56–71 list the 14 inward-backed components at one piece each.
- `supabase/migrations/20260904173100_set_fr_cruzer_backrest_pipe_quantity.sql:1`: confirmed backrest-pipe quantity of two.
- `src/lib/production.ts:224`: colour aggregation is by selected component, with no physical-position metadata.
