export function quantity(value: number | null | undefined, unit?: string | null) {
  if (value == null) return '—';
  const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);
  return unit ? `${number} ${unit}` : number;
}

export function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function ColorSwatch({ color }: { color: string }) {
  const swatches: Record<string, [string, string]> = {
    'Red-White': ['#b94840', '#fff'],
    'Aqua-Brown': ['#59b9ba', '#886849'],
    'White-Brown': ['#fff', '#886849'],
    'Military Green-Brown': ['#657357', '#886849'],
  };
  const pair = swatches[color] ?? ['#ddd', '#aaa'];
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 24, height: 24, flexShrink: 0, borderRadius: '50%', border: '1px solid #0002', background: `linear-gradient(135deg, ${pair[0]} 50%, ${pair[1]} 50%)` }} />;
}

export function csvDownload(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  // Keep spreadsheet applications from interpreting user/source text as formulas.
  const escape = (value: string | number | null | undefined) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(['\uFEFF', rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
