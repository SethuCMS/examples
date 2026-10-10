/**
 * Demonstrates the self-check as a Route Handler: POST runs the same checks
 * as the /self-check page and returns JSON. Try:
 *   curl -X POST http://localhost:3000/api/self-check
 * POST only, because it creates and deletes a scratch record.
 */
import { NextResponse } from 'next/server';
import { runSelfCheck } from '@/lib/selfcheck';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const result = await runSelfCheck({
    ...(url.searchParams.get('connection')
      ? { connection: url.searchParams.get('connection') as string }
      : {}),
    ...(url.searchParams.get('collection')
      ? { collection: url.searchParams.get('collection') as string }
      : {}),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
