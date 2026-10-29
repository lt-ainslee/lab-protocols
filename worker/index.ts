// API Worker: /api/* is handled here, everything else is served from the
// static assets (wrangler.jsonc: run_worker_first = ["/api/*"]).
//   GET /api/login?return=/path/   protected by Access: signs in, then goes back
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
      if (path === '/api/login' && req.method === 'GET') return await login(req, env);
      // The Access cookie rides along on cross-site requests too: writes must come from our own pages.
      if (req.method !== 'GET' && req.headers.get('Origin') !== new URL(req.url).origin) return error(403, 'bad_origin');
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

async function login(req: Request, env: Env): Promise<Response> {
  const back = new URL(req.url).searchParams.get('return') ?? '/';
  // Only paths on this site: "//host" or "/\\host" would leave it.
  const target = back.startsWith('/') && !/^\/[\/\\]/.test(back) ? back : '/';
  if (await userOf(req, env)) return Response.redirect(new URL(target, req.url).toString(), 302);
  // Reaching here signed out means Access does not guard /api/login on this host.
  return new Response('登录未配置：Cloudflare Access 没有保护本网址的 /api/login，请联系管理员（见 README「开启 Cloudflare Access」）。', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
