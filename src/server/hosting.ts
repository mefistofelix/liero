import api from './worker.js';

// The hosted Worker handles directory/signaling APIs only. Gameplay stays in browsers.
export default {
  async fetch(request: Request, env: any) {
    if (new URL(request.url).pathname.startsWith('/api/')) return api.fetch(request, env);
    return env.ASSETS.fetch(request);
  },
  scheduled: api.scheduled,
};
