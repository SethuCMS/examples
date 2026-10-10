/**
 * Root layout: navigation and the gateway address. Demonstrates that the
 * server can show the (non-secret) gateway URL while the token never appears.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { gatewayUrl } from '@/lib/sethu';
import './globals.css';

export const metadata: Metadata = {
  title: 'SethuCMS Next.js test UI',
  description:
    'Exercises the SethuCMS gateway from Next.js; token stays server-side.',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <strong>SethuCMS · Next.js test UI</strong>
          <nav>
            <Link href="/">Connections</Link>
            <Link href="/live">Live feed</Link>
            <Link href="/self-check">Self-check</Link>
            <Link href="/why">Why server-side?</Link>
          </nav>
          <span className="muted">gateway: {gatewayUrl() ?? 'not set'}</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
