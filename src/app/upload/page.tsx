import { requireInventoryAdminPage } from '@/lib/auth/server';
import { UploadInwardPanel } from '@/components/tools/upload-inward-panel';

export default async function UploadPage() {
  await requireInventoryAdminPage();

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-2xl">
        <UploadInwardPanel />
      </div>
    </div>
  );
}
