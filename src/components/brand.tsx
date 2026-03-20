import Link from 'next/link';

type BrandProps = {
  href?: string;
  compact?: boolean;
};

export function Brand({ href = '/', compact = false }: BrandProps) {
  const content = (
    <div className="flex items-center gap-3 text-neutral-950">
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        className={compact ? 'h-10 w-10 shrink-0' : 'h-14 w-14 shrink-0'}
        fill="none"
      >
        <path
          d="M18 12H96C108 12 114 25 108 36L72 101C67 111 53 111 48 101L12 36C6 25 12 12 24 12"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M33 34H86"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M59 35V79"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </svg>
      <div className="leading-none">
        <div className={compact ? 'text-2xl font-black tracking-tight' : 'text-4xl font-black tracking-tight'}>
          Tycoon
        </div>
        {!compact ? (
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Inventory Control
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
