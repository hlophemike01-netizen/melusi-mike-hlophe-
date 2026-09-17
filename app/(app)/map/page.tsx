import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/AppHeader';
import { CommunityMap } from '@/features/map/CommunityMap';

export const metadata: Metadata = { title: 'Community map' };

export default function MapPage() {
  return (
    <div className="-mx-4 -mt-4">
      <AppHeader title="Community map" subtitle="Approximate area counts only" />
      <CommunityMap />
    </div>
  );
}
