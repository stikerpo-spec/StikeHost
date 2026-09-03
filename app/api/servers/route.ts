import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getSession } from '../../../lib/auth';

async function nextPort() {
  for (let port = 25565; port <= 25999; port++) {
    const used = await db.server.findUnique({ where: { port }, select: { id: true } });
    if (!used) return port;
  }
  throw new Error('No free Minecraft ports available');
}

export async function GET() {
  const id = await getSession();
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await db.server.findMany({ where: { ownerId: id }, include: { worlds: true }, orderBy: { createdAt: 'desc' } }));
}

export async function POST(req: Request) {
  const id = await getSession();
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const name = String(b.name || 'Mein Server').trim().slice(0, 40) || 'Mein Server';
    const slugBase = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'server';
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;
    const port = await nextPort();
    const seed = b.seed === undefined || b.seed === '' ? null : String(b.seed);
    const server = await db.server.create({
      data: {
        ownerId: id,
        name,
        slug,
        version: String(b.version || '1.21.8'),
        type: String(b.type || 'VANILLA'),
        ramMb: Math.min(Math.max(Number(b.ramMb || 2048), 1024), 8192),
        port,
        motd: String(b.motd || 'A Minecraft Server').slice(0, 120),
        maxPlayers: Math.min(Math.max(Number(b.maxPlayers || 20), 1), 100),
        gamemode: ['survival', 'creative', 'adventure', 'spectator'].includes(b.gamemode) ? b.gamemode : 'survival',
        difficulty: ['peaceful', 'easy', 'normal', 'hard'].includes(b.difficulty) ? b.difficulty : 'normal',
        hardcore: Boolean(b.hardcore),
        pvp: b.pvp === undefined ? true : Boolean(b.pvp),
        onlineMode: b.onlineMode === undefined ? true : Boolean(b.onlineMode),
        whitelist: Boolean(b.whitelist),
        worlds: { create: { name: 'world', seed, gamemode: b.gamemode || 'survival', difficulty: b.difficulty || 'normal' } }
      },
      include: { worlds: true }
    });
    return NextResponse.json(server);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create server' }, { status: 500 });
  }
}
