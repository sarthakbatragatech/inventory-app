import { requireInventoryAdminPage } from '@/lib/auth/server';
import PageClient from './stock-page-client';

export default async function Page() {
  await requireInventoryAdminPage();
  return <PageClient />;
}
