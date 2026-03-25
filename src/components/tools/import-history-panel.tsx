import { getSupabaseServerClient } from '@/lib/supabase';

type Props = {
  title?: string;
  description?: string;
};

export async function ImportHistoryPanel({
  title = 'Import History',
  description = 'See all inward-upload batches and their processing state.',
}: Props) {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-rose-700">Failed to load imports: {error.message}</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-neutral-600">{description}</p>

      <div className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 text-left">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Imported Date</th>
              <th className="px-4 py-3">Uploaded At</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3">{row.file_name}</td>
                <td className="px-4 py-3">{row.imported_on_date || '—'}</td>
                <td className="px-4 py-3">{new Date(row.uploaded_at).toLocaleString()}</td>
                <td className="px-4 py-3">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
