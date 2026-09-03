import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getSession } from '../../../../lib/auth';
import { hostName, worker } from '../../../../lib/worker';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid }, include: { worlds: true } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let workerState: any = null;
  try { workerState = await worker(`/v1/servers/${id}/status`); } catch {}
  if (workerState?.status && workerState.status !== s.status) await db.server.update({ where: { id }, data: { status: workerState.status } });
  return NextResponse.json({ ...s, status: workerState?.status || s.status, address: `${hostName()}:${s.port}`, worker: workerState });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid }, include: { worlds: true } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const b = await req.json();
    const data = {
      name: b.name ?? s.name,
      motd: b.motd ?? s.motd,
      version: b.version ?? s.version,
      type: b.type ?? s.type,
      ramMb: Math.min(Math.max(Number(b.ramMb ?? s.ramMb), 1024), 8192),
      maxPlayers: Math.min(Math.max(Number(b.maxPlayers ?? s.maxPlayers), 1), 100),
      gamemode: ['survival','creative','adventure','spectator'].includes(b.gamemode) ? b.gamemode : s.gamemode,
      difficulty: ['peaceful','easy','normal','hard'].includes(b.difficulty) ? b.difficulty : s.difficulty,
      hardcore: b.hardcore ?? s.hardcore,
      pvp: b.pvp ?? s.pvp,
      onlineMode: b.onlineMode ?? s.onlineMode,
      whitelist: b.whitelist ?? s.whitelist,
      commandAliases: b.commandAliases ?? s.commandAliases,
    };
    const updated = await db.server.update({ where: { id }, data, include: { worlds: true } });
    await worker(`/v1/servers/${id}/config`, { method: 'POST', body: JSON.stringify({ ...updated, port: s.port, commandAliases: updated.commandAliases || [] }) });
    return NextResponse.json({ ...updated, address: `${hostName()}:${s.port}` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not update server' }, { status: 500 });
  }
}
