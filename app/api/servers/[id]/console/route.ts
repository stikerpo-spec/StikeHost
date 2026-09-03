import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';
import { worker } from '../../../../../lib/worker';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try { return NextResponse.json(await worker(`/v1/servers/${id}/logs?lines=300`)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Console unavailable' }, { status: 502 }); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try { const { command } = await req.json(); return NextResponse.json(await worker(`/v1/servers/${id}/command`, { method: 'POST', body: JSON.stringify({ command }) })); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Command failed' }, { status: 400 }); }
}
