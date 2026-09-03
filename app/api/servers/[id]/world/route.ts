import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';
import { worker } from '../../../../../lib/worker';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSession(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await db.server.findFirst({ where: { id, ownerId: uid }, include: { worlds: true } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const b = await req.json();
    const worldName = String(b.worldName || s.worlds[0]?.name || 'world').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40);
    const updatedWorld = await db.world.upsert({
      where:{serverId_name:{serverId:s.id,name:worldName}},
      update:{seed:b.seed===''?null:(b.seed??undefined),gamemode:b.gamemode??undefined,difficulty:b.difficulty??undefined,levelType:b.levelType??undefined},
      create:{serverId:s.id,name:worldName,seed:b.seed===''?null:(b.seed??null),gamemode:b.gamemode||'survival',difficulty:b.difficulty||'normal',levelType:b.levelType||'minecraft:normal'}
    });
    const config={version:s.version,type:s.type,ramMb:s.ramMb,port:s.port,motd:s.motd,maxPlayers:s.maxPlayers,gamemode:updatedWorld.gamemode,difficulty:updatedWorld.difficulty,hardcore:s.hardcore,pvp:s.pvp,onlineMode:s.onlineMode,whitelist:s.whitelist,commandAliases:s.commandAliases||[],worldName:updatedWorld.name,seed:updatedWorld.seed,levelType:updatedWorld.levelType};
    if(b.reset) await worker(`/v1/servers/${id}/world/reset`,{method:'POST',body:JSON.stringify({world:updatedWorld.name,seed:updatedWorld.seed})});
    else await worker(`/v1/servers/${id}/config`,{method:'POST',body:JSON.stringify(config)});
    await db.server.update({where:{id},data:{gamemode:updatedWorld.gamemode,difficulty:updatedWorld.difficulty}});
    return NextResponse.json(updatedWorld);
  } catch(e){ return NextResponse.json({error:e instanceof Error?e.message:'World update failed'},{status:400}); }
}
