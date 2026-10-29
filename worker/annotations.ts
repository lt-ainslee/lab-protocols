// /api/annotations: comment threads anchored to quoted text on a page.
//   GET    /api/annotations?page=/synthesis/x/   threads (with replies) on a page
//   POST   /api/annotations                      new thread {page, quote, prefix, suffix, body}
//   POST   /api/annotations/:id/replies          reply {body}
//   PATCH  /api/annotations/:id                  {resolved: boolean} (threads only)
//   DELETE /api/annotations/:id                  soft delete, author only
//   POST   /api/annotations/:id/issue            turn a thread into a GitHub issue {title, source}
import { userOf } from './auth';
import { error, json, type Env } from './http';
import { createIssue, issueContent, issuesConfigured } from './issues';

interface Row {
  id: string;
  page: string;
  parent_id: string | null;
  quote: string;
  prefix: string;
  suffix: string;
  body: string;
  author: string;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
  issue_number: number | null;
  issue_url: string | null;
}

const LIMITS = { page: 300, quote: 2000, context: 64, body: 5000, title: 200, source: 300 };
const ID_RE = /^[0-9a-f-]{36}$/;
const COLUMNS = 'id, page, parent_id, quote, prefix, suffix, body, author, created_at, resolved_at, resolved_by, issue_number, issue_url';

const validPage = (p: unknown): p is string => typeof p === 'string' && p.startsWith('/') && p.length <= LIMITS.page;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function threads(rows: Row[]) {
  const replies = new Map<string, Row[]>();
  for (const r of rows) if (r.parent_id) replies.set(r.parent_id, [...(replies.get(r.parent_id) ?? []), r]);
  return rows
    .filter((r) => !r.parent_id)
    .map((t) => ({
      id: t.id,
      page: t.page,
      quote: t.quote,
      prefix: t.prefix,
      suffix: t.suffix,
      body: t.body,
      author: t.author,
      createdAt: t.created_at,
      resolvedAt: t.resolved_at,
      resolvedBy: t.resolved_by,
      issueNumber: t.issue_number,
      issueUrl: t.issue_url,
      replies: (replies.get(t.id) ?? []).map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.created_at })),
    }));
}

export async function handleAnnotations(req: Request, env: Env, path: string): Promise<Response | null> {
  const parts = path.split('/').filter(Boolean); // ['api', 'annotations', id?, 'replies'?]
  if (parts[1] !== 'annotations' || parts.length > 4) return null;
  const db = env.DB;
  const id = parts[2];
  if (id !== undefined && !ID_RE.test(id)) return error(404, 'not_found');

  if (req.method === 'GET' && !id) {
    const page = new URL(req.url).searchParams.get('page');
    if (!validPage(page)) return error(400, 'bad_page');
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM annotations WHERE page = ? AND deleted_at IS NULL ORDER BY created_at`)
      .bind(page)
      .all<Row>();
    return json({ threads: threads(results) });
  }

  const user = await userOf(req, env);
  if (!user) return error(401, 'sign_in_required');
  const now = Date.now();

  if (req.method === 'POST' && !id) {
    const b = await readBody(req);
    const page = b?.page;
    const quote = text(b?.quote, LIMITS.quote).trim();
    const body = text(b?.body, LIMITS.body).trim();
    if (!validPage(page) || !quote || !body) return error(400, 'bad_request');
    const row: Row = {
      id: crypto.randomUUID(),
      page,
      parent_id: null,
      quote,
      prefix: text(b?.prefix, LIMITS.context),
      suffix: text(b?.suffix, LIMITS.context),
      body,
      author: user,
      created_at: now,
      resolved_at: null,
      resolved_by: null,
      issue_number: null,
      issue_url: null,
    };
    await db
      .prepare('INSERT INTO annotations (id, page, quote, prefix, suffix, body, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.page, row.quote, row.prefix, row.suffix, row.body, row.author, now, now)
      .run();
    return json(threads([row])[0], 201);
  }

  if (!id) return error(405, 'method_not_allowed');
  const target = await db.prepare(`SELECT ${COLUMNS} FROM annotations WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Row>();
  if (!target) return error(404, 'not_found');

  if (parts[3] === 'replies') {
    if (req.method !== 'POST') return error(405, 'method_not_allowed');
    if (target.parent_id) return error(400, 'not_a_thread');
    const body = text((await readBody(req))?.body, LIMITS.body).trim();
    if (!body) return error(400, 'bad_request');
    const reply = { id: crypto.randomUUID(), body, author: user, createdAt: now };
    await db
      .prepare('INSERT INTO annotations (id, page, parent_id, body, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(reply.id, target.page, target.id, body, user, now, now)
      .run();
    return json(reply, 201);
  }
  if (parts[3] === 'issue') {
    if (req.method !== 'POST') return error(405, 'method_not_allowed');
    if (target.parent_id) return error(400, 'not_a_thread');
    if (!issuesConfigured(env)) return error(503, 'issues_not_configured');
    if (target.issue_url) return json({ issueNumber: target.issue_number, issueUrl: target.issue_url });
    const b = await readBody(req);
    const { results: replies } = await db
      .prepare('SELECT body, author, created_at FROM annotations WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at')
      .bind(id)
      .all<{ body: string; author: string; created_at: number }>();
    const content = issueContent(target, replies, {
      id,
      origin: new URL(req.url).origin,
      title: text(b?.title, LIMITS.title),
      source: text(b?.source, LIMITS.source),
      by: user,
      preview: env.SITE_ENV === 'preview',
    });
    const issue = await createIssue(env, content);
    await db
      .prepare('UPDATE annotations SET issue_number = ?, issue_url = ?, updated_at = ? WHERE id = ?')
      .bind(issue.number, issue.url, now, id)
      .run();
    return json({ issueNumber: issue.number, issueUrl: issue.url }, 201);
  }
  if (parts[3] !== undefined) return error(404, 'not_found');

  if (req.method === 'PATCH') {
    if (target.parent_id) return error(400, 'not_a_thread');
    const resolved = (await readBody(req))?.resolved;
    if (typeof resolved !== 'boolean') return error(400, 'bad_request');
    await db
      .prepare('UPDATE annotations SET resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?')
      .bind(resolved ? now : null, resolved ? user : null, now, id)
      .run();
    return json({ id, resolvedAt: resolved ? now : null, resolvedBy: resolved ? user : null });
  }

  if (req.method === 'DELETE') {
    if (target.author !== user) return error(403, 'not_author');
    // Deleting a thread removes its replies with it.
    await db.prepare('UPDATE annotations SET deleted_at = ?, updated_at = ? WHERE (id = ? OR parent_id = ?) AND deleted_at IS NULL').bind(now, now, id, id).run();
    return new Response(null, { status: 204 });
  }

  return error(405, 'method_not_allowed');
}
