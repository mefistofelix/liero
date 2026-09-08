import { REGIONS, detectRegion, joinQueue, queueStatus, leaveQueue, cleanup } from './matchmaker.js';
import {roomAPI} from './rooms.js';
import {mapAPI} from './maps.js';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function playerKey(request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
    if(url.pathname==='/api/maps')return mapAPI(request);
    if (request.method === 'GET' && url.pathname === '/api/region') {
      return json({ region: detectRegion(request.cf), regions: REGIONS });
    }
    if(url.pathname==='/api/rooms'||url.pathname.startsWith('/api/rooms/'))return roomAPI(request,env,await playerKey(request));
    if (url.pathname !== '/api/queue') return json({ error: 'Not found' }, 404);
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: 'GET, POST, DELETE' } });
    }
    const key = await playerKey(request);
    if (!key) return json({ error: 'A 32-byte random hex Bearer token is required' }, 401);
    const now = Math.floor(Date.now() / 1000);
    try {
      if (request.method === 'GET') {
        const result = await queueStatus(env.DB, key, now);
        return result ? json(result) : json({ error: 'Queue entry missing or expired' }, 404);
      }
      if (request.method === 'DELETE') {
        return await leaveQueue(env.DB, key)
          ? new Response(null, { status: 204 })
          : json({ error: 'Already matched; disconnect through the game server' }, 409);
      }
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
        return json({ error: 'Use application/json' }, 415);
      }
      // Bound the body before JSON parsing, including chunked requests.
      const reader = request.body?.getReader();
      let raw = '';
      let bytes = 0;
      const decoder = new TextDecoder();
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024) { await reader.cancel(); return json({ error: 'Body too large' }, 413); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid body' }, 400);
      const region = body.region === undefined || body.region === 'auto'
        ? detectRegion(request.cf) : body.region;
      if (!REGIONS.includes(region)) return json({ error: 'Select a region; automatic location unavailable or invalid', regions: REGIONS }, 400);
      return json(await joinQueue(env.DB, key, region, now));
    } catch (error) {
      console.error('Matchmaking request failed', error.name);
      return json({ error: 'Matchmaking temporarily unavailable' }, 503);
    }
  },
  async scheduled(_event, env) {
    await cleanup(env.DB, Math.floor(Date.now() / 1000));
  },
};
