const workerUrl = process.env.WORKER_URL || 'http://worker:4000';
const workerSecret = process.env.WORKER_SECRET || 'dev';

export async function worker(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-Worker-Secret', workerSecret);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${workerUrl}${path}`, { ...init, headers, cache: 'no-store' });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || `Worker error ${res.status}`);
  return data;
}

export function hostName() {
  return process.env.PUBLIC_HOST || 'play.stikehost.de';
}
