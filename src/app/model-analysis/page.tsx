import { requireInventoryAdminPage } from '@/lib/auth/server';
import { permanentRedirect } from 'next/navigation';

export default async function ModelAnalysisPage() {
  await requireInventoryAdminPage();

  permanentRedirect('/stock');
}
