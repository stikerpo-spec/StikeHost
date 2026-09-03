"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Server = { id:string; name:string; slug:string; version:string; type:string; status:string; ramMb:number; port:number; address?:string; };

export default function Dashboard(){
  const [servers,setServers]=useState<Server[]>([]); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const [form,setForm]=useState({name:'',version:'1.21.8',type:'PAPER',ramMb:2048,motd:'A Minecraft Server',maxPlayers:20,gamemode:'survival',difficulty:'normal',hardcore:false,pvp:true,onlineMode:true,whitelist:false,seed:''});
  const load=()=>fetch('/api/servers').then(r=>r.ok?r.json():[]).then(setServers);
  useEffect(()=>{load()},[]);
  function set<K extends keyof typeof form>(key:K,value:(typeof form)[K]){setForm(v=>({...v,[key]:value}));}
  async function create(){setBusy(true);setMessage('');const r=await fetch('/api/servers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const d=await r.json();if(!r.ok)setMessage(d.error||'Fehler');else{setMessage('Server erstellt. Starte ihn im Server-Panel.');setForm(v=>({...v,name:'',seed:''}));await load()}setBusy(false)}
  return <main className="wrap">
    <div className="nav"><div className="logo">⛏ StikeHost</div><span className="pill">Minecraft Control Panel</span></div>
    <div className="dash"><aside className="side"><div className="card"><h3>Menü</h3><div className="tabs" style={{flexDirection:'column'}}><Link className="tab" href="/dashboard">🏠 Übersicht</Link><span className="tab">🖥 Meine Server</span><span className="tab">⚙ Globale Einstellungen</span></div><p className="muted" style={{lineHeight:1.5}}>Jeder Server läuft als eigener Minecraft-Container mit eigener IP/Port-Adresse.</p></div></aside>
    <section>
      <div className="card"><h1>Server erstellen</h1><p className="muted">Stelle deinen Server direkt beim Erstellen ein. Plugins funktionieren mit Paper, Spigot und Purpur.</p>
        <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          <input className="input" placeholder="Servername" value={form.name} onChange={e=>set('name',e.target.value)}/>
          <select className="input" value={form.version} onChange={e=>set('version',e.target.value)}><option>1.21.8</option><option>1.21.7</option><option>1.21.6</option><option>1.21.5</option><option>1.20.6</option></select>
          <select className="input" value={form.type} onChange={e=>set('type',e.target.value)}><option value="PAPER">Paper</option><option value="VANILLA">Vanilla</option><option value="SPIGOT">Spigot</option><option value="PURPUR">Purpur</option></select>
          <select className="input" value={form.ramMb} onChange={e=>set('ramMb',Number(e.target.value))}><option value={1024}>1 GB RAM</option><option value={2048}>2 GB RAM</option><option value={4096}>4 GB RAM</option><option value={8192}>8 GB RAM</option></select>
          <input className="input" placeholder="MOTD" value={form.motd} onChange={e=>set('motd',e.target.value)}/>
          <input className="input" type="number" min={1} max={100} placeholder="Max. Spieler" value={form.maxPlayers} onChange={e=>set('maxPlayers',Number(e.target.value))}/>
          <select className="input" value={form.gamemode} onChange={e=>set('gamemode',e.target.value)}><option value="survival">Survival</option><option value="creative">Creative</option><option value="adventure">Adventure</option></select>
          <select className="input" value={form.difficulty} onChange={e=>set('difficulty',e.target.value)}><option value="peaceful">Peaceful</option><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select>
          <input className="input" placeholder="Seed (leer = zufällig)" value={form.seed} onChange={e=>set('seed',e.target.value)}/>
        </div>
        <div className="tabs"><label className="tab"><input type="checkbox" checked={form.hardcore} onChange={e=>set('hardcore',e.target.checked)}/> Hardcore</label><label className="tab"><input type="checkbox" checked={form.pvp} onChange={e=>set('pvp',e.target.checked)}/> PvP</label><label className="tab"><input type="checkbox" checked={form.onlineMode} onChange={e=>set('onlineMode',e.target.checked)}/> Premium/Online Mode</label><label className="tab"><input type="checkbox" checked={form.whitelist} onChange={e=>set('whitelist',e.target.checked)}/> Whitelist</label></div>
        <button className="btn" disabled={busy||!form.name.trim()} onClick={create}>{busy?'Erstelle...':'Server erstellen'}</button>{message&&<span className="muted" style={{marginLeft:12}}>{message}</span>}
      </div>
      <div style={{height:18}}/>
      <div className="card"><h2>Meine Server</h2>{servers.length===0?<p className="muted">Noch kein Server vorhanden.</p>:servers.map(s=><Link href={'/dashboard/server/'+s.id} className="card server" key={s.id} style={{marginTop:10}}><div><div style={{fontSize:20,fontWeight:800}}>{s.name}</div><div className="muted">{s.type} · {s.version} · {s.ramMb/1024} GB · {s.address||`play.stikehost.de:${s.port}`}</div></div><span className="pill">{s.status}</span></Link>)}</div>
    </section></div></main>;
}