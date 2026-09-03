import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';
import { hostName, worker } from '../../../../../lib/worker';

async function getOwned(id: string, ownerId: string) {
  return db.server.findFirst({ where: { id, ownerId }, include: { worlds: true } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ownerId = await getSession();
  const { id } = await params;
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await getOwned(id, ownerId);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const { action } = await req.json();
    if (!['start', 'stop', 'restart'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const payload = { version: s.version, type: s.type, ramMb: s.ramMb, port: s.port, motd: s.motd, maxPlayers: s.maxPlayers, gamemode: s.gamemode, difficulty: s.difficulty, hardcore: s.hardcore, pvp: s.pvp, onlineMode: s.onlineMode, whitelist: s.whitelist, commandAliases: s.commandAliases || [] };
    const result = await worker(`/v1/servers/${id}/${action}`, { method: 'POST', body: JSON.stringify(payload) });
    const updated = await db.server.update({ where: { id }, data: { status: result.status || action === 'stop' ? 'stopped' : 'running' } });
    return NextResponse.json({ ...updated, address: `${hostName()}:${s.port}`, worker: result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Worker failed' }, { status: 500 });
  }
}
