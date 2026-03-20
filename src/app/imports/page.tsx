import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (error) {
    return <div className="p-6">Failed to load imports: {error.message}</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold">Import History</h1>

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
                  <td className="px-4 py-3">
                    {new Date(row.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}