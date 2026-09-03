import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';
import { worker } from '../../../../../lib/worker';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await worker(`/v1/servers/${id}/plugins`));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = await req.json();
    if (!['PAPER','SPIGOT','PURPUR'].includes(String(s.type).toUpperCase())) return NextResponse.json({ error: 'Plugins require Paper, Spigot or Purpur.' }, { status: 400 });
    return NextResponse.json(await worker(`/v1/servers/${id}/plugins/install`, { method: 'POST', body: JSON.stringify(body) }));
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Plugin install failed' }, { status: 400 }); }
}
