const BASE = process.env.FALIX_API_URL || 'https://client.falixnodes.net/api/v2';
const KEY = process.env.FALIX_API_KEY || '';

export function falixConfigured() { return Boolean(KEY); }
export function falixKeyPresent() { return KEY ? 'configured' : 'missing'; }

export async function falix(path: string, init: RequestInit = {}) {
  if (!KEY) throw new Error('Falix is not configured. Set FALIX_API_KEY on the server.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${KEY}`);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const code = data?.error?.code ? ` [${data.error.code}]` : '';
    const actionUrl = data?.error?.action_url ? ` Action: ${data.error.action_url}` : '';
    throw new Error(`${data?.error?.message || data?.message || `Falix API ${res.status}`}${code}${actionUrl}`);
  }
  return data?.data ?? data;
}

export function falixCreateInit(input: any) {
  const loaderMap: Record<string,string> = { PAPER:'paper', SPIGOT:'spigot', PURPUR:'purpur', VANILLA:'vanilla' };
  const loader = loaderMap[input.type] || 'paper';
  const motd = String(input.motd || 'A Minecraft Server').replace(/\n/g, ' ');
  const lines = [
    '#falix-init',
    'version: 1',
    'application:',
    '  slug: minecraft-java',
    `  loader: ${loader}`,
    `  version: "${String(input.version || '1.21').replace(/"/g, '')}"`,
    'env:',
    `  MOTD: ${motd}`,
    'files:',
    '  - path: server.properties',
    '    content: |',
    `      motd=${motd}`,
    `      max-players=${Math.max(1, Number(input.maxPlayers || 20))}`,
    `      gamemode=${input.gamemode || 'survival'}`,
    `      difficulty=${input.difficulty || 'normal'}`,
    `      hardcore=${Boolean(input.hardcore)}`,
    `      pvp=${input.pvp === undefined ? true : Boolean(input.pvp)}`,
    `      online-mode=${input.onlineMode === undefined ? true : Boolean(input.onlineMode)}`,
    `      white-list=${Boolean(input.whitelist)}`,
    '      enable-command-block=true',
    'run:',
    '  final_state: stopped',
  ];
  if (input.seed) lines.splice(lines.findIndex(x => x.includes('max-players')) + 1, 0, `      level-seed=${String(input.seed).replace(/\n/g, '')}`);
  return lines.join('\n');
}
