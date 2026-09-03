import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';
import { falix, falixConfigured, falixCreateInit } from '../../../lib/falix';

export async function GET() {
  const ownerId = await getSession();
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await db.server.findMany({ where: { ownerId }, include: { worlds: true }, orderBy: { createdAt: 'desc' } }));
}

export async function POST(req: Request) {
  const ownerId = await getSession();
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!falixConfigured()) return NextResponse.json({ error: 'Echtes Hosting ist noch nicht verbunden. FALIX_API_KEY muss serverseitig gesetzt werden.' }, { status: 503 });
  try {
    const b = await req.json();
    const name = String(b.name || 'Mein Server').trim().slice(0, 20) || 'Mein Server';
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(name)) return NextResponse.json({ error: 'Servername muss 3-20 Zeichen haben.' }, { status: 400 });
    const domain = `${name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'server'}-${Math.random().toString(36).slice(2, 6)}`;
    const remote = await falix('/servers', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ name, domain, init: falixCreateInit(b) }) });
    const providerId = String(remote?.id ?? remote?.server_id ?? remote?.identifier ?? '');
    if (!providerId) return NextResponse.json({ error: 'Hosting-Provider hat keine Server-ID zurückgegeben.' }, { status: 502 });
    const server = await db.server.create({
      data: {
        ownerId, name, slug: String(remote?.domain ?? domain), provider: 'falix', providerId,
        version: String(b.version || '1.21.8'), type: String(b.type || 'PAPER'),
        ramMb: Math.min(Math.max(Number(b.ramMb || 2048), 1024), 8192), port: Number(remote?.port || 0),
        status: String(remote?.status || 'installing'), motd: String(b.motd || 'A Minecraft Server').slice(0, 120),
        maxPlayers: Math.min(Math.max(Number(b.maxPlayers || 20), 1), 100),
        gamemode: ['survival','creative','adventure','spectator'].includes(b.gamemode) ? b.gamemode : 'survival',
        difficulty: ['peaceful','easy','normal','hard'].includes(b.difficulty) ? b.difficulty : 'normal',
        hardcore: Boolean(b.hardcore), pvp: b.pvp === undefined ? true : Boolean(b.pvp),
        onlineMode: b.onlineMode === undefined ? true : Boolean(b.onlineMode), whitelist: Boolean(b.whitelist),
        worlds: { create: { name: 'world', seed: b.seed ? String(b.seed) : null, gamemode: b.gamemode || 'survival', difficulty: b.difficulty || 'normal' } }
      }, include: { worlds: true }
    });
    return NextResponse.json(server, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create hosted server' }, { status: 502 }); }
}
