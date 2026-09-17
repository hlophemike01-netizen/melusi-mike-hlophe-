'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/home', label: 'Home', icon: '🏠' },
  { href: '/map', label: 'Map', icon: '🗺️' },
  { href: '/groups', label: 'Groups', icon: '👥' },
  { href: '/activity', label: 'Activity', icon: '🏃' },
  { href: '/profile', label: 'Profile', icon: '⚙️' },
] as const;

/**
 * Primary navigation. Five destinations, fixed to the bottom where a thumb
 * reaches, with generous targets — this is used while walking.
 *
 * The emergency control is NOT in here. It sits above the navigation as a
 * separate, always-visible control, because burying it one tap deep inside a
 * tab would be exactly the wrong trade.
 */
export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-[var(--surface-raised)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[var(--spacing-touch)] flex-col items-center justify-center gap-0.5 px-1 py-2',
                  'text-[11px] font-medium transition-colors',
                  active ? 'text-brand-700 dark:text-brand-300' : 'text-secondary',
                )}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
