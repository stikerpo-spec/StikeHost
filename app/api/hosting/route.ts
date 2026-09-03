import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { falix, falixConfigured, falixCreateInit } from '../../../lib/falix';

export async function GET() {
  const uid = await getSession();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!falixConfigured()) return NextResponse.json({ provider: 'falix', configured: false });
  try {
    const me = await falix('/me');
    return NextResponse.json({ provider: 'falix', configured: true, account: me?.account?.username || null, scopes: me?.key?.scopes || [] });
  } catch (e) {
    return NextResponse.json({ provider: 'falix', configured: false, error: e instanceof Error ? e.message : 'Falix unavailable' }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const uid = await getSession();
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!falixConfigured()) return NextResponse.json({ error: 'Falix ist noch nicht verbunden. Setze FALIX_API_KEY in der Hosting-Umgebung.' }, { status: 503 });
  try {
    const input = await req.json();
    const name = String(input.name || 'StikeServer').trim().slice(0, 20);
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(name)) return NextResponse.json({ error: 'Servername muss 3-20 Zeichen haben.' }, { status: 400 });
    const body = {
      name,
      domain: String(input.domain || name.toLowerCase().replace(/[^a-z0-9-]/g, '-')).slice(0, 30),
      init: falixCreateInit(input),
    };
    const result = await falix('/servers', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
    return NextResponse.json(result, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falix server creation failed' }, { status: 502 });
  }
}
