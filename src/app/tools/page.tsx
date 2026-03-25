import { ImportHistoryPanel } from '@/components/tools/import-history-panel';
import { UploadInwardPanel } from '@/components/tools/upload-inward-panel';

export const dynamic = 'force-dynamic';

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Tools</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-700">
            Upload inward Excel files and review import-history status from one page.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <UploadInwardPanel
            title="Upload Inward Excel"
            description="Add a new inward batch and immediately review what changed."
          />
          <ImportHistoryPanel
            title="Import History"
            description="Review processed import batches, imported dates, and status."
          />
        </div>
      </div>
    </div>
  );
}
