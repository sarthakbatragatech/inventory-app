import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { FR_CRUZER_PART_REFERENCES } from './fr-cruzer-part-reference';

test('all 16 coloured part references have an existing asset and source', () => {
  const photos = Object.values(FR_CRUZER_PART_REFERENCES).filter(ref => ref.photoUrl);
  assert.equal(photos.length, 16);
  for (const ref of photos) {
    assert.ok(ref.photoUrl?.startsWith('/components/fr-cruzer/'));
    assert.ok(existsSync(join(process.cwd(), 'public', ref.photoUrl!)));
    assert.ok(ref.source.includes('.xlsx'));
  }
});

test('the four missing exact-colour photos are explicitly mould references', () => {
  const placeholders = Object.entries(FR_CRUZER_PART_REFERENCES).filter(([, ref]) => ref.photoKind === 'mould');
  assert.deepEqual(placeholders.map(([sku]) => sku).sort(), ['FR001-2128-WHITE', 'FR001-2136-GREEN', 'FR001-2136-RED', 'FR001-2138-RED']);
  for (const [, ref] of placeholders) assert.match(ref.contents!, /colour does not represent/);
});

test('quantity questions are distinct from mould-kit evidence', () => {
  const reviews = Object.entries(FR_CRUZER_PART_REFERENCES).filter(([, ref]) => ref.review).map(([sku]) => sku).sort();
  assert.deepEqual(reviews, ['FR001-2137-BROWN', 'FR001-2137-RED', 'FR001-2141-BIG', 'FR001-2141-SMALL', 'FR001-HANDLE-GRIP']);
  assert.equal(FR_CRUZER_PART_REFERENCES['FR001-2136-RED'].review, undefined);
  assert.match(FR_CRUZER_PART_REFERENCES['FR001-2127-RED'].contents!, /two front tank panels/);
});
