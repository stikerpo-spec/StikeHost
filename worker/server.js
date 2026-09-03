const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '2mb' }));
const SECRET = process.env.WORKER_SECRET || 'dev';
const ROOT = '/srv/stikehost';
const DEFAULT_IMAGE = 'itzg/minecraft-server:latest';
fs.mkdirSync(ROOT, { recursive: true });

function auth(req, res, next) {
  if (req.get('X-Worker-Secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { timeout: 60000, maxBuffer: 4 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve((stdout || '').trim());
    });
  });
}

function dirFor(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('invalid server id');
  const dir = path.join(ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function containerName(id) {
  return `stikehost_${id}`;
}

function envValue(name, fallback) {
  return process.env[name] || fallback;
}

function bool(v, fallback = false) {
  return v === undefined ? fallback : Boolean(v);
}

function propertiesFromConfig(c) {
  const lines = [
    `motd=${String(c.motd ?? 'A Minecraft Server').replace(/\r?\n/g, ' ')}`,
    `max-players=${Number(c.maxPlayers ?? 20)}`,
    `gamemode=${c.gamemode ?? 'survival'}`,
    `difficulty=${c.difficulty ?? 'normal'}`,
    `hardcore=${bool(c.hardcore)}`,
    `pvp=${bool(c.pvp, true)}`,
    `online-mode=${bool(c.onlineMode, true)}`,
    `white-list=${bool(c.whitelist)}`,
    'enable-command-block=true',
    'enable-rcon=true'
  ];
  if (c.worldName) lines.push(`level-name=${String(c.worldName).replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  if (c.seed) lines.push(`level-seed=${String(c.seed)}`);
  return `${lines.join('\n')}\n`;
}

function writeProperties(id, config) {
  const dir = dirFor(id);
  const file = path.join(dir, 'server.properties');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const map = new Map();
  for (const line of current.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.startsWith('#')) map.set(line.slice(0, idx), line.slice(idx + 1));
  }
  for (const line of propertiesFromConfig(config).trim().split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) map.set(line.slice(0, idx), line.slice(idx + 1));
  }
  fs.writeFileSync(file, [...map.entries()].map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

function writeAliases(id, aliases) {
  const dir = dirFor(id);
  const clean = (Array.isArray(aliases) ? aliases : []).filter(x => x && /^[a-zA-Z0-9_-]+$/.test(String(x.alias)) && String(x.command || '').trim());
  const body = clean.length
    ? `aliases:\n${clean.map(x => `  ${x.alias}:\n    - "${String(x.command).replace(/"/g, '\\"')}"`).join('\n')}\n`
    : 'aliases: {}\n';
  fs.writeFileSync(path.join(dir, 'commands.yml'), body);
}

async function inspect(id) {
  try {
    const raw = await run(['inspect', containerName(id), '--format', '{{json .}}']);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function createContainer(id, cfg) {
  const name = containerName(id);
  const dir = dirFor(id);
  const rconPassword = crypto.createHash('sha256').update(`${SECRET}:${id}`).digest('hex').slice(0, 32);
  const env = [
    `EULA=TRUE`,
    `VERSION=${cfg.version || '1.21.8'}`,
    `TYPE=${cfg.type || 'VANILLA'}`,
    `MEMORY=${Math.max(1024, Number(cfg.ramMb || 2048))}M`,
    `RCON_PASSWORD=${rconPassword}`,
    'ENABLE_RCON=true',
    `MOTD=${cfg.motd || 'A Minecraft Server'}`,
    `MAX_PLAYERS=${Number(cfg.maxPlayers || 20)}`,
    `MODE=${cfg.gamemode || 'survival'}`,
    `DIFFICULTY=${cfg.difficulty || 'normal'}`,
    `HARDCORE=${bool(cfg.hardcore)}`,
    `PVP=${bool(cfg.pvp, true)}`,
    `ONLINE_MODE=${bool(cfg.onlineMode, true)}`,
    `ENABLE_WHITELIST=${bool(cfg.whitelist)}`,
    `ENABLE_COMMAND_BLOCK=true`
  ];
  await run(['create', '--name', name, '--restart', 'unless-stopped', '--memory', `${Math.max(1024, Number(cfg.ramMb || 2048))}m`, '-p', `${Number(cfg.port)}:25565/tcp`, '-v', `${dir}:/data`, ...env.flatMap(v => ['-e', v]), DEFAULT_IMAGE]);
  writeProperties(id, cfg);
  writeAliases(id, cfg.commandAliases);
  return name;
}

async function ensure(id, cfg) {
  const existing = await inspect(id);
  if (!existing) return createContainer(id, cfg);
  return containerName(id);
}

async function state(id) {
  const info = await inspect(id);
  if (!info) return { status: 'missing' };
  const running = Boolean(info.State && info.State.Running);
  return {
    status: running ? 'running' : (info.State?.Status || 'stopped'),
    container: info.Name?.replace(/^\//, '') || containerName(id),
    startedAt: info.State?.StartedAt || null,
    exitCode: info.State?.ExitCode ?? null,
    image: info.Config?.Image || DEFAULT_IMAGE
  };
}

async function restartIfRunning(id, wasRunning) {
  if (wasRunning) await run(['restart', '-t', '20', containerName(id)]);
}

app.use('/v1', auth);

app.get('/health', (_, res) => res.json({ ok: true }));

app.get('/v1/servers/:id/status', async (req, res) => {
  try { res.json(await state(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/v1/servers/:id/logs', async (req, res) => {
  try {
    const lines = Math.min(1000, Math.max(20, Number(req.query.lines || 250)));
    const out = await run(['logs', '--tail', String(lines), containerName(req.params.id)]);
    res.json({ logs: out });
  } catch (e) { res.json({ logs: `No logs yet: ${e.message}` }); }
});

app.post('/v1/servers/:id/start', async (req, res) => {
  try {
    await ensure(req.params.id, req.body || {});
    await run(['start', containerName(req.params.id)]);
    res.json(await state(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/v1/servers/:id/stop', async (req, res) => {
  try { await run(['stop', '-t', '20', containerName(req.params.id)]); res.json(await state(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/v1/servers/:id/restart', async (req, res) => {
  try { await run(['restart', '-t', '20', containerName(req.params.id)]); res.json(await state(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/v1/servers/:id/command', async (req, res) => {
  try {
    const command = String(req.body?.command || '').trim();
    if (!command || command.length > 500 || /[\r\n]/.test(command)) return res.status(400).json({ error: 'Invalid command' });
    const info = await inspect(req.params.id);
    if (!info?.State?.Running) return res.status(409).json({ error: 'Server is not running' });
    const out = await run(['exec', containerName(req.params.id), 'rcon-cli', ...command.split(/\s+/)]);
    res.json({ output: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/v1/servers/:id/config', async (req, res) => {
  try {
    const cfg = req.body || {};
    const info = await inspect(req.params.id);
    const wasRunning = Boolean(info?.State?.Running);
    const name = await ensure(req.params.id, cfg);
    writeProperties(req.params.id, cfg);
    writeAliases(req.params.id, cfg.commandAliases);
    if (cfg.ramMb) await run(['update', '--memory', `${Math.max(1024, Number(cfg.ramMb))}m`, name]);
    if (wasRunning) await restartIfRunning(req.params.id, true);
    res.json(await state(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/v1/servers/:id/plugins/install', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Plugin URL must be http(s)' });
    const dir = path.join(dirFor(req.params.id), 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    const rawName = String(req.body?.fileName || `plugin-${Date.now()}.jar`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const file = path.join(dir, rawName.endsWith('.jar') ? rawName : `${rawName}.jar`);
    await new Promise((resolve, reject) => {
      const https = require(url.startsWith('https:') ? 'https' : 'http');
      const request = https.get(url, response => {
        if ([301,302,307,308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          return https.get(response.headers.location, r2 => {
            if (r2.statusCode !== 200) return reject(new Error(`Download failed: ${r2.statusCode}`));
            const stream = fs.createWriteStream(file); r2.pipe(stream); stream.on('finish', () => stream.close(resolve)); stream.on('error', reject);
          }).on('error', reject);
        }
        if (response.statusCode !== 200) return reject(new Error(`Download failed: ${response.statusCode}`));
        const stream = fs.createWriteStream(file); response.pipe(stream); stream.on('finish', () => stream.close(resolve)); stream.on('error', reject);
      });
      request.on('error', reject);
    });
    res.json({ ok: true, file: path.basename(file) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/v1/servers/:id/plugins', async (req, res) => {
  try {
    const dir = path.join(dirFor(req.params.id), 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    res.json({ plugins: fs.readdirSync(dir).filter(x => x.toLowerCase().endsWith('.jar')).sort() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/v1/servers/:id/world/reset', async (req, res) => {
  try {
    const world = String(req.body?.world || 'world').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = dirFor(req.params.id);
    const info = await inspect(req.params.id);
    if (info?.State?.Running) await run(['stop', '-t', '20', containerName(req.params.id)]);
    fs.rmSync(path.join(dir, world), { recursive: true, force: true });
    if (req.body?.seed !== undefined) {
      const file = path.join(dir, 'server.properties');
      let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      text = text.replace(/^level-seed=.*$/m, '').replace(/\n{3,}/g, '\n');
      text += `\nlevel-seed=${String(req.body.seed || '')}\nlevel-name=${world}\n`;
      fs.writeFileSync(file, text);
    }
    await run(['start', containerName(req.params.id)]);
    res.json({ ok: true, world });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/v1/servers/:id/files', async (req, res) => {
  try {
    const dir = dirFor(req.params.id);
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map(x => ({ name: x.name, type: x.isDirectory() ? 'directory' : 'file', size: x.isFile() ? fs.statSync(path.join(dir, x.name)).size : null }));
    res.json({ files: entries });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(4000, () => console.log('StikeHost worker listening on 4000'));
