'use client';

import { useId, useRef, useState, type FormEvent } from 'react';

type Props = {
  fgSku: string;
  colors: string[];
  onSaved: () => void;
};

function today() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

const inputClass =
  'mt-1.5 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100 sm:text-sm';
const buttonFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600';

export function ProductionEntryDialog({ fgSku, colors, onSaved }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [productionDate, setProductionDate] = useState(today);
  const [colorVariant, setColorVariant] = useState(colors[0] ?? '');
  const [quantity, setQuantity] = useState('');
  const [packedQuantity, setPackedQuantity] = useState('');
  const [reportReference, setReportReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  function open() {
    setError('');
    dialogRef.current?.showModal();
    dateRef.current?.focus();
  }

  function close() {
    if (!savingRef.current) dialogRef.current?.close();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    const assembled = Number(quantity || 0);
    const packed = Number(packedQuantity || 0);
    if (
      !Number.isSafeInteger(assembled) || assembled < 0 ||
      !Number.isSafeInteger(packed) || packed < 0
    ) {
      setError('Assembled and packed quantities must be whole numbers, zero or more.');
      return;
    }
    if (assembled === 0 && packed === 0) {
      setError('Enter an assembled or packed quantity greater than zero.');
      return;
    }
    if (!productionDate || !colors.includes(colorVariant)) {
      setError('Choose a production date and colour.');
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError('');
    let saved = false;
    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fgSku,
          productionDate,
          colorVariant,
          quantity: assembled,
          packedQuantity: packed,
          reportReference: reportReference.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Production was not saved. Please try again.');
      }
      saved = true;
    } catch (saveError) {
      setError(
        saveError instanceof TypeError
          ? 'Could not confirm the save. Check production activity before trying again.'
          : saveError instanceof Error
            ? saveError.message
            : 'Could not confirm the save. Check production activity before trying again.'
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }

    if (saved) {
      setProductionDate(today());
      setQuantity('');
      setPackedQuantity('');
      setReportReference('');
      setNotes('');
      dialogRef.current?.close();
      // Refresh failures belong to the dashboard; this entry has already been saved.
      onSaved();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 ${buttonFocus}`}
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span>
        Record production
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        onCancel={(event) => { if (savingRef.current) event.preventDefault(); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[560px] overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/45 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{fgSku}</p>
            <h2 id={`${id}-title`} className="mt-1 text-xl font-semibold tracking-tight">Record production</h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={isSaving}
            aria-label="Close production form"
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl text-2xl text-stone-500 hover:bg-stone-100 hover:text-neutral-900 disabled:opacity-40 ${buttonFocus}`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form onSubmit={save} className="p-5 sm:p-6" aria-busy={isSaving}>
          <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            <legend className="sr-only">Production details</legend>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <label htmlFor={`${id}-date`} className="min-w-0 text-sm font-medium">
                Date
                <input
                  ref={dateRef}
                  id={`${id}-date`}
                  type="date"
                  value={productionDate}
                  onChange={(event) => setProductionDate(event.target.value)}
                  required
                  className={inputClass}
                />
              </label>
              <label htmlFor={`${id}-colour`} className="min-w-0 text-sm font-medium">
                Colour
                <select
                  id={`${id}-colour`}
                  value={colorVariant}
                  onChange={(event) => setColorVariant(event.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="" disabled>Choose colour</option>
                  {colors.map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
              </label>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-4">
              <label htmlFor={`${id}-assembled`} className="min-w-0 text-sm font-medium">
                Assembled
                <input
                  id={`${id}-assembled`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  aria-describedby={`${id}-quantity-help`}
                  className={inputClass}
                />
              </label>
              <label htmlFor={`${id}-packed`} className="min-w-0 text-sm font-medium">
                Packed
                <input
                  id={`${id}-packed`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={packedQuantity}
                  onChange={(event) => setPackedQuantity(event.target.value)}
                  aria-describedby={`${id}-quantity-help`}
                  className={inputClass}
                />
              </label>
            </div>
            <p id={`${id}-quantity-help`} className="-mt-2 text-xs leading-5 text-stone-500">
              Enter this report’s output only. Packed units may come from earlier assembly.
            </p>

            <details className="rounded-xl border border-stone-200 p-3.5">
              <summary className={`cursor-pointer rounded text-sm font-medium text-stone-600 ${buttonFocus}`}>
                Reference & notes <span className="font-normal text-stone-400">(optional)</span>
              </summary>
              <div className="mt-4 space-y-4">
                <label htmlFor={`${id}-reference`} className="block text-sm font-medium">
                  Report reference
                  <input
                    id={`${id}-reference`}
                    type="text"
                    value={reportReference}
                    onChange={(event) => setReportReference(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label htmlFor={`${id}-notes`} className="block text-sm font-medium">
                  Notes
                  <textarea
                    id={`${id}-notes`}
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={`${inputClass} resize-y`}
                  />
                </label>
              </div>
            </details>
          </fieldset>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">{error}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
            <button
              type="button"
              disabled={isSaving}
              onClick={close}
              className={`min-h-11 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-50 ${buttonFocus}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`min-h-11 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 ${buttonFocus}`}
            >
              {isSaving ? 'Saving…' : 'Save production'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
