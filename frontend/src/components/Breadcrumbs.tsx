'use client';

import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">/</span>}
            {isLast || !item.href ? (
              <span className={isLast ? 'font-medium text-gray-900' : ''}>{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-gray-700">{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
