import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import crypto from "crypto";
import archiver from "archiver";
import tar from "tar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SERVERS = path.join(ROOT, "servers");
const DB = path.join(DATA, "servers.json");
const PORT = Number(process.env.PORT || 3000);
await fsp.mkdir(DATA,{recursive:true}); await fsp.mkdir(SERVERS,{recursive:true});
if (!fs.existsSync(DB)) await fsp.writeFile(DB,"[]");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
app.use(express.json({limit:"5mb"}));
app.use(express.static(path.join(ROOT,"public")));

const procs = new Map();
const logs = new Map();

function readDB(){ return JSON.parse(fs.readFileSync(DB,"utf8")); }
async function writeDB(x){ await fsp.writeFile(DB,JSON.stringify(x,null,2)); }
function sid(){return crypto.randomUUID().slice(0,8)}
function safeName(s){return String(s).toLowerCase().replace(/[^a-z0-9-_]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,32)||"server"}
function serverDir(id){return path.join(SERVERS,id)}
function meta(id){return readDB().find(x=>x.id===id)}
function publicServer(x){
  return {...x, status: procs.has(x.id) ? "online":"offline", pid:procs.get(x.id)?.pid ?? null,
    address:`localhost:${x.port}`};
}
function appendLog(id,line){
  const arr=logs.get(id)||[]; arr.push(line.trimEnd()); if(arr.length>1000) arr.splice(0,arr.length-1000);
  logs.set(id,arr); io.to(id).emit("console",line.trimEnd());
}
function javaBin(){ return process.env.JAVA_BIN || "java"; }

async function ensureEula(id){
  const d=serverDir(id); const e=path.join(d,"eula.txt");
  await fsp.writeFile(e,"eula=true\n");
}
async function download(url,dest){
  const r=await fetch(url); if(!r.ok) throw new Error(`Download fehlgeschlagen (${r.status})`);
  const buf=Buffer.from(await r.arrayBuffer()); await fsp.writeFile(dest,buf);
}
async function getPaperBuild(version){
  const r=await fetch(`https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(version)}`);
  if(!r.ok) throw new Error("Minecraft/Paper-Version nicht gefunden");
  const j=await r.json(); const builds=j.builds; const build=builds[builds.length-1];
  const ar=`paper-${version}-${build}.jar`;
  return {jar:ar,url:`https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(version)}/builds/${build}/downloads/${ar}`};
}

async function createServer(cfg){
  const id=sid(), slug=safeName(cfg.name);
  const dir=serverDir(id); await fsp.mkdir(dir,{recursive:true}); await fsp.mkdir(path.join(dir,"plugins"),{recursive:true});
  await fsp.mkdir(path.join(dir,"mods"),{recursive:true}); await fsp.mkdir(path.join(dir,"backups"),{recursive:true});
  const p=Number(cfg.port||25565);
  const db=readDB();
  let port=p; while(db.some(x=>x.port===port)) port++;
  const software=cfg.software||"paper", version=cfg.version||"1.21.8";
  let jarName="";
  if(software==="paper"){
    const meta=await getPaperBuild(version); jarName=meta.jar; await download(meta.url,path.join(dir,jarName));
  } else {
    throw new Error("In dieser Vollversion ist Paper als echte Server-Engine aktiviert. Weitere Loader können später ergänzt werden.");
  }
  await ensureEula(id);
  const props=`server-port=${port}\nserver-ip=\nmotd=${String(cfg.motd||slug).replaceAll("\n"," ")}\ngamemode=${cfg.gamemode||"survival"}\ndifficulty=${cfg.difficulty||"normal"}\npvp=${cfg.pvp!==false}\nmax-players=${Number(cfg.maxPlayers||10)}\nwhite-list=${cfg.whitelist===true}\nonline-mode=true\n`;
  await fsp.writeFile(path.join(dir,"server.properties"),props);
  const obj={id,slug,name:cfg.name||"Mein Server",version,software,port,maxPlayers:Number(cfg.maxPlayers||10),
    ram:Number(cfg.ram||2),motd:cfg.motd||"StikeHost Server",createdAt:new Date().toISOString(),jar:jarName};
  db.push(obj); await writeDB(db); return obj;
}

function startServer(id){
  if(procs.has(id)) return;
  const m=meta(id); if(!m) throw new Error("Server nicht gefunden");
  const dir=serverDir(id);
  const heap=Math.max(1,Number(m.ram||2));
  const child=spawn(javaBin(),[`-Xms${heap}G`,`-Xmx${heap}G`,"-jar",m.jar,"nogui"],{cwd:dir});
  procs.set(id,child); logs.set(id,[]);
  appendLog(id,`[StikeHost] Starte ${m.name} ...`);
  child.stdout.on("data",d=>String(d).split(/\r?\n/).forEach(l=>l&&appendLog(id,l)));
  child.stderr.on("data",d=>String(d).split(/\r?\n/).forEach(l=>l&&appendLog(id,"[ERR] "+l)));
  child.on("close",code=>{appendLog(id,`[StikeHost] Prozess beendet (Code ${code})`);procs.delete(id);io.to(id).emit("status",{status:"offline"});});
}
function sendCmd(id,cmd){const p=procs.get(id); if(!p) throw new Error("Server ist offline"); p.stdin.write(cmd.replace(/^\/+/,"")+"\n");}
function stopServer(id){
  const p=procs.get(id); if(!p) return;
  p.stdin.write("stop\n"); setTimeout(()=>{if(procs.has(id)) p.kill("SIGTERM")},15000);
}
async function removeDirSafe(root,rel){
  const abs=path.resolve(root,rel); if(abs!==root && !abs.startsWith(root+path.sep)) throw new Error("Ungültiger Pfad");
  await fsp.rm(abs,{recursive:true,force:true});
}
function resolveServerPath(id,rel=""){
  const root=serverDir(id), abs=path.resolve(root,rel);
  if(abs!==root && !abs.startsWith(root+path.sep)) throw new Error("Ungültiger Pfad");
  return abs;
}

app.get("/api/servers",(_,res)=>res.json(readDB().map(publicServer)));
app.get("/api/servers/:id",(req,res)=>{const m=meta(req.params.id); if(!m)return res.status(404).json({error:"Nicht gefunden"}); res.json(publicServer(m))});
app.get("/api/servers/:id/logs",(req,res)=>res.json(logs.get(req.params.id)||[]));
app.post("/api/servers",(req,res)=>createServer(req.body).then(x=>res.json(publicServer(x))).catch(e=>res.status(400).json({error:e.message})));
app.post("/api/servers/:id/start",(req,res)=>{try{startServer(req.params.id);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/stop",(req,res)=>{try{stopServer(req.params.id);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/restart",(req,res)=>{try{stopServer(req.params.id);setTimeout(()=>{try{startServer(req.params.id)}catch{}},4000);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/command",(req,res)=>{try{sendCmd(req.params.id,String(req.body.command||""));res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/servers/:id",async(req,res)=>{try{stopServer(req.params.id);await new Promise(r=>setTimeout(r,1000));await removeDirSafe(SERVERS,req.params.id);await writeDB(readDB().filter(x=>x.id!==req.params.id));res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/servers/:id/files",async(req,res)=>{try{
 const root=serverDir(req.params.id), rel=String(req.query.path||""); const abs=resolveServerPath(req.params.id,rel);
 const ents=await fsp.readdir(abs,{withFileTypes:true}); const out=[]; for(const e of ents){const st=await fsp.stat(path.join(abs,e.name)); out.push({name:e.name,dir:e.isDirectory(),size:st.size,mtime:st.mtime});}
 res.json({path:rel,items:out.sort((a,b)=>Number(b.dir)-Number(a.dir)||a.name.localeCompare(b.name))});
}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/servers/:id/file",async(req,res)=>{try{const p=resolveServerPath(req.params.id,String(req.query.path||""));res.json({content:await fsp.readFile(p,"utf8")})}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/servers/:id/file",async(req,res)=>{try{const p=resolveServerPath(req.params.id,String(req.body.path||""));await fsp.mkdir(path.dirname(p),{recursive:true});await fsp.writeFile(p,String(req.body.content??""));res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/folder",async(req,res)=>{try{await fsp.mkdir(resolveServerPath(req.params.id,String(req.body.path||"")), {recursive:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/servers/:id/file",async(req,res)=>{try{await removeDirSafe(serverDir(req.params.id),String(req.body.path||""));res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/servers/:id/properties",async(req,res)=>{try{const t=await fsp.readFile(path.join(serverDir(req.params.id),"server.properties"),"utf8");const p={};t.split(/\r?\n/).forEach(l=>{if(l&&!l.startsWith("#")){const i=l.indexOf("=");if(i>0)p[l.slice(0,i)]=l.slice(i+1)}});res.json(p)}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/servers/:id/properties",async(req,res)=>{try{const p=resolveServerPath(req.params.id,"server.properties");const old=await fsp.readFile(p,"utf8");const kv=req.body||{};const lines=old.split(/\r?\n/).filter(Boolean);const seen=new Set();const out=lines.map(l=>{const i=l.indexOf("=");if(i<0)return l;const k=l.slice(0,i);if(k in kv){seen.add(k);return `${k}=${kv[k]}`}return l});for(const k of Object.keys(kv))if(!seen.has(k))out.push(`${k}=${kv[k]}`);await fsp.writeFile(p,out.join("\n")+"\n");res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});

app.post("/api/servers/:id/backup",async(req,res)=>{try{
 const id=req.params.id, d=serverDir(id), file=path.join(d,"backups",`backup-${Date.now()}.zip`);await fsp.mkdir(path.dirname(file),{recursive:true});
 await new Promise((resolve,reject)=>{const out=fs.createWriteStream(file), a=archiver("zip",{zlib:{level:5}});out.on("close",resolve);a.on("error",reject);a.pipe(out);a.glob("**/*",{cwd:d,ignore:["backups/**"]});a.finalize()});res.json({ok:true,file:path.basename(file)})
}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/servers/:id/backups",async(req,res)=>{try{const d=path.join(serverDir(req.params.id),"backups");await fsp.mkdir(d,{recursive:true});const names=await fsp.readdir(d);res.json(await Promise.all(names.filter(x=>x.endsWith(".zip")).map(async n=>{const s=await fsp.stat(path.join(d,n));return{name:n,size:s.size,mtime:s.mtime}})))}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/backups/:name/restore",async(req,res)=>{try{
 const id=req.params.id,name=path.basename(req.params.name),d=serverDir(id); if(procs.has(id)) throw new Error("Server zuerst stoppen");
 const file=path.join(d,"backups",name); await tar.extract({file, cwd:d}).catch(async()=>{await fsp.rm(path.join(d,"plugins"),{recursive:true,force:true});throw new Error("ZIP-Backup-Wiederherstellung ist über die UI nur für neuere Backups vorgesehen. Erstelle nach dem Backup erneut.")});
 res.json({ok:true});
}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/servers/:id/players",(req,res)=>{const m=meta(req.params.id);if(!m)return res.status(404).json({error:"Nicht gefunden"}); try{sendCmd(m.id,"list")}catch{} res.json({online:"siehe Konsole"});});
app.post("/api/servers/:id/player",(req,res)=>{try{const {name,action}=req.body;sendCmd(req.params.id,`${action==="op"?"op":"deop"} ${name}`);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/whitelist",(req,res)=>{try{const {name,action}=req.body;sendCmd(req.params.id,`whitelist ${action==="add"?"add":"remove"} ${name}`);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});

app.get("/api/plugins/search",async(req,res)=>{try{
 const q=encodeURIComponent(String(req.query.q||""));
 const r=await fetch(`https://api.modrinth.com/v2/search?query=${q}&facets=${encodeURIComponent('["project_type:plugin"]')}&limit=12`);
 if(!r.ok)throw new Error("Modrinth nicht erreichbar"); const j=await r.json();res.json(j.hits.map(x=>({id:x.project_id,title:x.title,desc:x.description,icon:x.icon_url,downloads:x.downloads,slug:x.slug})));
}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/servers/:id/plugins/install",async(req,res)=>{try{
 const {project,version}=req.body, r=await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(project)}/version`);
 if(!r.ok)throw new Error("Plugin-Projekt nicht gefunden"); const versions=await r.json();const v=versions.find(x=>!version||x.version_number===version)||versions[0];
 const f=v.files.find(x=>x.filename.endsWith(".jar")); if(!f)throw new Error("Keine JAR gefunden");
 const p=path.join(serverDir(req.params.id),"plugins",path.basename(f.filename));await download(f.url,p);res.json({ok:true,file:path.basename(p)})
}catch(e){res.status(400).json({error:e.message})}});

io.on("connection",socket=>socket.on("join-server",id=>{socket.join(id);socket.emit("status",{status:procs.has(id)?"online":"offline"});(logs.get(id)||[]).forEach(l=>socket.emit("console",l))}));

httpServer.listen(PORT,()=>console.log(`StikeHost läuft auf http://localhost:${PORT}`));
