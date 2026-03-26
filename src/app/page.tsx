import { Brand } from '@/components/brand';

const homeLinks = [
  {
    href: '/tools',
    title: 'Tools',
    description: 'Upload inward Excel files and review import-history status in one place.',
  },
  {
    href: '/items',
    title: 'Inward Data',
    description: 'Review inwarded SKUs, quantities, and latest receipts.',
  },
  {
    href: '/bom',
    title: 'Manage BOMs',
    description: 'Map finished-good models to the component SKUs they consume.',
  },
  {
    href: '/stock',
    title: 'Stock',
    description: 'Review inventory, model-scoped BOM pressure, print preview, and current balance.',
  },
  {
    href: '/reconciliation',
    title: 'Reconciliation',
    description: 'Capture end-of-day physical stock counts that stay fixed for that date.',
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <Brand />
          <p className="mt-6 max-w-5xl text-base leading-8 text-neutral-700 sm:text-lg">
            SKU master, inward imports, searchable item history, and cleaner stock
            visibility for the Tycoon workflow.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {homeLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="group flex min-h-52 flex-col justify-between rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-gradient-to-br hover:from-sky-50 hover:to-amber-50 hover:shadow-md"
              >
                <div>
                  <div className="text-2xl font-semibold tracking-tight text-neutral-950 transition group-hover:text-sky-950">
                    {link.title}
                  </div>
                  <div className="mt-4 max-w-xs text-base leading-8 text-neutral-600 transition group-hover:text-neutral-700">
                    {link.description}
                  </div>
                </div>
                <div className="mt-6 text-sm font-medium text-neutral-400 transition group-hover:text-amber-700">
                  Open section
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
