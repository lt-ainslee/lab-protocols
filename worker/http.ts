export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const error = (status: number, code: string, extra: Record<string, unknown> = {}) => json({ error: code, ...extra }, status);

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Access team domain, e.g. "mylab.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Local development only (.dev.vars): acts as this user without Access. */
  DEV_USER?: string;
}
