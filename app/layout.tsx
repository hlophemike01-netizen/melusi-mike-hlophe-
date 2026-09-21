import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { publicEnv } from '@/lib/env';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: {
    default: 'Mwhite SafeCircle',
    template: '%s · Mwhite SafeCircle',
  },
  description:
    'Share a walk, run or journey with people you trust — on your terms. Location sharing is optional and always temporary.',
  applicationName: 'Mwhite SafeCircle',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    // iOS home-screen label. Truncated by the launcher at roughly 12
    // characters, so this carries the distinctive half of the name rather
    // than rendering as "Mwhite Safe…". Matches manifest short_name.
    title: 'SafeCircle',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
  // Resolves relative Open Graph image paths and canonical URLs.
  metadataBase: new URL(publicEnv.siteUrl),

  // noindex is the DEFAULT for the whole app: a signed-in page, a group roster
  // or a share link has no business in a search index. The two genuinely
  // public pages — the landing page and the privacy explainer — opt back in
  // individually via their own `metadata` export.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never disable zoom: people with low vision need it, and a safety app is
  // the last place to take it away.
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1f7b78' },
    { media: '(prefers-color-scheme: dark)', color: '#171917' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
