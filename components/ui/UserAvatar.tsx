import { cn } from '@/lib/cn';

/**
 * Avatar.
 *
 * Falls back to initials rather than a generic silhouette, so a member list
 * stays scannable without anyone needing to upload a photo of themselves —
 * which many users of a safety product reasonably prefer not to do.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  } as const;

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (avatarUrl) {
    return (
      // A plain <img>: avatars come from Supabase Storage at arbitrary origins,
      // and configuring next/image remote patterns per deployment is a worse
      // trade than shipping a 40px image directly.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn('shrink-0 rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800',
        'dark:bg-brand-800 dark:text-brand-50',
        sizes[size],
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}
