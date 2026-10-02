import { requireInventoryAdminPage } from '@/lib/auth/server';
import { ImportHistoryPanel } from '@/components/tools/import-history-panel';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  await requireInventoryAdminPage();

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl">
        <ImportHistoryPanel />
      </div>
    </div>
  );
}
