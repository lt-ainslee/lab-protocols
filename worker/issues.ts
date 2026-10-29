// POST /api/annotations/:id/issue: turn an annotation thread into a GitHub
// issue, so a reviewed comment becomes a tracked change request. The issue
// carries the page, the source file, the quoted text with its context and the
// whole discussion; with the "claude" label the Claude workflow
// (.github/workflows/claude.yml) picks it up and proposes the edit.
// Authors appear by the local part of their email only: emails stay off GitHub.
import type { Env } from './http';

export interface IssueThread {
  page: string;
  quote: string;
  prefix: string;
  suffix: string;
  body: string;
  author: string;
  created_at: number;
}

export interface IssueReply {
  body: string;
  author: string;
  created_at: number;
}

export const issuesConfigured = (env: Env) => !!(env.GITHUB_TOKEN && env.GITHUB_REPO);

/** GitHub refused the request; status and message are shown to the user to fix the token. */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`github issues: HTTP ${status} ${detail}`);
  }
}

const SOURCE_RE = /^src\/content\/docs\/[\w./-]+\.mdx?$/;
const shortName = (email: string) => email.split('@')[0];
const fmtTime = (t: number) =>
  new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(t);
// Keep "@name" in annotation text from pinging GitHub users or triggering @claude.
const defuse = (s: string) => s.replace(/@/g, '@​');
// Quotes across table cells or list items come with runs of blank lines; one line break is enough.
const tidy = (s: string) => s.replace(/[ \t]*\n\s*/g, '\n');
const quoteBlock = (s: string) => tidy(s).trim().split('\n').map((l) => `> ${l}`).join('\n');
const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

export function issueContent(
  t: IssueThread,
  replies: IssueReply[],
  opts: { id: string; origin: string; title: string; source: string; by: string; preview: boolean },
) {
  const source = SOURCE_RE.test(opts.source) ? opts.source : '';
  const pageTitle = oneLine(opts.title, 80) || t.page;
  const comment = (who: string, at: number, body: string) => `**${shortName(who)}** · ${fmtTime(at)}\n\n${defuse(body)}`;
  const body = [
    `由 **${shortName(opts.by)}** 从网站批注转为 issue。`,
    '',
    `- 页面：[${pageTitle}](${opts.origin}${t.page})（${opts.preview ? '实验预览版' : '正式版'}）`,
    `- 源文件：${source ? `\`${source}\`` : '（未知，请按页面路径查找）'}`,
    '',
    '### 批注的原文',
    '',
    quoteBlock(defuse(t.quote)),
    '',
    '上下文（【】内为批注的文字）：',
    '',
    '````text',
    tidy(`…${t.prefix}【${t.quote}】${t.suffix}…`),
    '````',
    '',
    '### 批注',
    '',
    comment(t.author, t.created_at, t.body),
    ...(replies.length ? ['', '### 回复', '', replies.map((r) => comment(r.author, r.created_at, r.body)).join('\n\n---\n\n')] : []),
    '',
    '---',
    '',
    // No literal "@claude" here: the Claude action takes the text after it as the request.
    '带 claude 标签的 issue 会由 Claude 修改对应 SOP 并推送分支；需要补充说明时，在评论里 @ 它（写成 @ 加 claude，不带空格）。不需要改动的话直接关闭。',
    '',
    `<!-- annotation-id: ${opts.id} -->`,
  ].join('\n');
  return { title: `[批注] ${pageTitle}：${oneLine(t.quote, 40)}`, body };
}

export async function createIssue(env: Env, content: { title: string; body: string }) {
  const labels = (env.GITHUB_ISSUE_LABELS ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lab-protocols-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...content, labels }),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 300);
    try {
      const b = JSON.parse(text) as { message?: string; errors?: { message?: string; field?: string; code?: string }[] };
      const more = (b.errors ?? []).map((e) => e.message ?? [e.field, e.code].filter(Boolean).join(' ')).filter(Boolean);
      detail = [b.message, ...more].filter(Boolean).join('; ') || detail;
    } catch {
      // not JSON: keep the raw text
    }
    throw new GitHubError(res.status, detail);
  }
  const issue = (await res.json()) as { number: number; html_url: string };
  return { number: issue.number, url: issue.html_url };
}
