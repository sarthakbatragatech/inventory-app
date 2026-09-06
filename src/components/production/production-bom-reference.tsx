import Image from 'next/image';
import s from './production-bom-reference.module.css';

const productPhotos = [
  { colour: 'Red-white', file: 'red-white', source: 'IMG_5860.HEIC' },
  { colour: 'Aqua-brown', file: 'aqua-brown', source: 'IMG_5858.HEIC' },
  { colour: 'White-brown', file: 'white-brown', source: 'IMG_5854.HEIC' },
  { colour: 'Military green-brown', file: 'military-green-brown', source: 'IMG_5856.HEIC' },
] as const;

const quantityChecks = [
  {
    part: 'Handle grips',
    sku: 'FR001-HANDLE-GRIP',
    current: '1 set · packing',
    check: 'Confirm 2 individual grips per bike, and whether inward “pcs” counts individual grips or pairs.',
    evidence: 'The photo shows a pair weighing about 49 g; recorded inward works out to about 24.5 g per counted piece.',
  },
  {
    part: 'Big & small wheel halves',
    sku: 'FR001-2141-BIG / SMALL',
    current: '1 of each · assembly',
    check: 'Confirm 3 big + 3 small halves per bike, and whether they should be consumed at packing rather than assembly.',
    evidence: 'The bike has three wheels. Excel divides the matched wheel stock by three and deducts packed production.',
  },
  {
    part: 'Wheel shroud rings · 2137',
    sku: 'FR001-2137-BROWN / RED',
    current: '1 ring · assembly',
    check: 'Confirm 3 rings per bike, including whether any wheel needs a ring on both sides.',
    evidence: 'The source photo shows one ring at about 13 g. Coloured rings are visible on all three wheels.',
  },
] as const;

export function ProductionBomReference() {
  return <details className={s.reference}>
    <summary className={s.summary}>
      <span className={s.summaryTitle}>Product &amp; BOM reference</span>
      <span className={s.summaryHint}>Colour photos · factory checks</span>
      <svg className={s.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div className={s.content}>
      <div className={s.photoGrid}>
        {productPhotos.map(photo => {
          const url = `/components/fr-cruzer/reference/${photo.file}.webp`;
          return <figure className={s.photoCard} key={photo.file}>
            <a className={s.photoLink} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${photo.colour} Cruzer reference photo in a new tab`}>
              <Image src={url} alt={`${photo.colour} FR-Cruzer, photographed in the factory`} fill sizes="(max-width: 540px) 90vw, (max-width: 1000px) 43vw, 300px" unoptimized />
            </a>
            <figcaption><strong>{photo.colour}</strong><span>Dump / {photo.source}</span></figcaption>
          </figure>;
        })}
      </div>

      <section className={s.colourNote} aria-label="Red-white colour placement">
        <h3>Red-white is a front-to-back split, not left-to-right</h3>
        <p>The tank has red panels toward the handlebars and white trim toward the seat, on both sides. The <strong>2127 front-fender kit includes the front tank panels</strong>; the white <strong>2129 tank-trim kit</strong> completes the rear section. The red front panels are already included, not a missing red 2129 line.</p>
        <p>Brown seats, backrests and grips are shared across the four colour combinations.</p>
        <span className={s.source}>Evidence: Dump / IMG_5860, IMG_5861, IMG_5844 and IMG_5855; CRUSIER BIKE MOULDS.xlsx / Item List photos for 2127 and 2129.</span>
      </section>

      <section className={s.audit} aria-label="BOM quantity checks">
        <div className={s.auditHeading}><h3>Check these at the factory · 07 Sep 2026 audit</h3><span className={s.pending}>Quantities unchanged pending confirmation</span></div>
        <div className={s.checks}>
          {quantityChecks.map(check => <article className={s.check} key={check.part}>
            <div className={s.partHeading}><h4>{check.part}</h4><span>{check.sku}</span></div>
            <dl><div><dt>BOM at audit</dt><dd>{check.current}</dd></div><div><dt>Confirm</dt><dd>{check.check}</dd></div></dl>
            <p>{check.evidence}</p>
          </article>)}
        </div>
        <p className={s.coverage}><strong>Coverage check:</strong> confirm how the battery, charger and fasteners are supplied and counted. Their separate BOM coverage is not yet established.</p>
      </section>

      <section className={s.kitNote} aria-label="Mould kit counting">
        <h3>Count mould kits as kits</h3>
        <p>Several photos show multiple pieces made together. That does not automatically mean the BOM needs that many sets. For example, the <strong>2136 wheel-cover photo shows a ten-piece kit at about 65 g</strong>, consistent with the source average for one recorded kit. Confirm the inward counting unit before multiplying any quantity.</p>
        <span className={s.source}>Quantity evidence: CRUSIER BIKE MOULDS.xlsx / Item List, Inward and Production; FR-001 Cruzer Stock Report.xlsx. Photos identify parts and support checks; they do not certify the complete engineering BOM.</span>
      </section>
    </div>
  </details>;
}
