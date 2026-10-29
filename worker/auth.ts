// Identity comes from Cloudflare Access. The site itself is public; Access
// guards only /api/login (and whole Preview hosts). A request through Access
// carries the signed JWT in the Cf-Access-Jwt-Assertion header; after sign-in
// the same JWT sits in the CF_Authorization cookie, scoped to the whole host,
// so every other page is recognised too. The email is trusted only after the
// signature, audience, issuer and expiry check out.
// Without ACCESS_TEAM_DOMAIN / ACCESS_AUD nobody is signed in (fail closed).
import type { Env } from './http';

interface Jwk extends JsonWebKey {
  kid: string;
}

const CERTS_TTL_MS = 10 * 60 * 1000;
let certs: { team: string; keys: Jwk[]; fetchedAt: number } | null = null;

async function accessKeys(team: string, force = false): Promise<Jwk[]> {
  if (!force && certs && certs.team === team && Date.now() - certs.fetchedAt < CERTS_TTL_MS) return certs.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access certs: HTTP ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  certs = { team, keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decodeJson = <T>(s: string): T => JSON.parse(new TextDecoder().decode(b64url(s))) as T;

interface AccessClaims {
  aud: string | string[];
  iss: string;
  exp: number;
  nbf?: number;
  email?: string;
}

export const authConfigured = (env: Env) => !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

/** ACCESS_AUD may list several Access applications, comma-separated. */
const audiences = (env: Env) => env.ACCESS_AUD!.split(',').map((a) => a.trim()).filter(Boolean);

function accessToken(req: Request): string | null {
  const header = req.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.get('Cookie') ?? '');
  return m ? m[1] : null;
}

/** The signed-in user's email, or null. */
export async function userOf(req: Request, env: Env): Promise<string | null> {
  if (env.DEV_USER) return env.DEV_USER;
  if (!authConfigured(env)) return null;
  const token = accessToken(req);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson<{ alg: string; kid: string }>(parts[0]);
    if (header.alg !== 'RS256') return null;
    const team = env.ACCESS_TEAM_DOMAIN!;
    let jwk = (await accessKeys(team)).find((k) => k.kid === header.kid);
    // Access rotates its keys; refetch once for an unknown key id.
    jwk ??= (await accessKeys(team, true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const claims = decodeJson<AccessClaims>(parts[1]);
    const now = Date.now() / 1000;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.some((a) => audiences(env).includes(a)) || claims.iss !== `https://${team}` || claims.exp < now || (claims.nbf ?? 0) > now + 60) return null;
    return claims.email ?? null;
  } catch (e) {
    console.error('access jwt', e);
    return null;
  }
}
