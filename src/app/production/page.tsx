import { requireInventoryAdminPage } from '@/lib/auth/server';
import { ProductionWorkspace } from '@/components/production/production-workspace';
import { FR_CRUZER_COLORS, FR_CRUZER_SKU } from '@/lib/production';

export const dynamic = 'force-dynamic';

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireInventoryAdminPage();

  const { view } = await searchParams;
  return (
        <ProductionWorkspace
          fgSku={FR_CRUZER_SKU}
          colors={[...FR_CRUZER_COLORS]}
          focusView={view === 'focus'}
        />
  );
}
