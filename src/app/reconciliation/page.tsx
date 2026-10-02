import { requireInventoryAdminPage } from '@/lib/auth/server';
import PageClient from './reconciliation-page-client';

export default async function Page() {
  await requireInventoryAdminPage();
  return <PageClient />;
}
