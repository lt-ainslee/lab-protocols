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
  /** Secret: GitHub token allowed to create issues in GITHUB_REPO. */
  GITHUB_TOKEN?: string;
  /** "owner/repo" that annotations are turned into issues in. */
  GITHUB_REPO?: string;
  /** Comma-separated labels for those issues; "claude" hands them to the Claude workflow. */
  GITHUB_ISSUE_LABELS?: string;
  /** "preview" on Worker Previews, to tell the two sites apart in issues. */
  SITE_ENV?: string;
}
