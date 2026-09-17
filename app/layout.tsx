import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: {
    default: 'SafeCircle',
    template: '%s · SafeCircle',
  },
  description:
    'Share a walk, run or journey with people you trust — on your terms. Location sharing is optional and always temporary.',
  applicationName: 'SafeCircle',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
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
  // A safety tool has no reason to appear in search results, and a public
  // profile page indexed by a crawler is a privacy problem.
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
