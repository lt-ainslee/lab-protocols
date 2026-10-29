// API Worker: /api/* is handled here, everything else is served from the
// static assets (wrangler.jsonc: run_worker_first = ["/api/*"]).
import { handleAnnotations } from './annotations';
import { authConfigured, userOf } from './auth';
import { error, json, type Env } from './http';
import { issuesConfigured } from './issues';
import { ensureSchema, SCHEMA_VERSION } from './schema';

export type { Env };

export default {
  async fetch(req, env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (path === '/api/me' && req.method === 'GET') {
        return json({
          user: await userOf(req, env),
          authConfigured: authConfigured(env) || !!env.DEV_USER,
          issuesEnabled: issuesConfigured(env),
        });
      }
      await ensureSchema(env.DB);
      if (path === '/api/health' && req.method === 'GET') return json({ ok: true, schema: SCHEMA_VERSION });
      return (await handleAnnotations(req, env, path)) ?? error(404, 'no_route');
    } catch (e) {
      console.error(e);
      return error(500, 'server_error');
    }
  },
} satisfies ExportedHandler<Env>;
